import asyncio
import logging
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any, BinaryIO
from uuid import uuid4

import pandas as pd

from app.repositories.imports import ImportRepository
from app.repositories.rows import RowRepository
from app.schemas.detection import DetectedColumn
from app.schemas.ingestion import IngestMode
from app.services.detection import detect_file_types, validate_header
from app.services.file_reader import FileReadError, read_chunks
from app.services.imports import ImportNotFoundError, parse_object_id
from app.services.type_conversion import ColumnPlan, convert_chunk
from app.services.type_detection import ColumnType

logger = logging.getLogger(__name__)


class IngestionError(Exception):
    """Invalid ingestion request (mapped to HTTP 400)."""


class SchemaMismatchError(Exception):
    """Append file does not match the import's columns (mapped to HTTP 409)."""


def plan_from_types(header: list[str], types: list[DetectedColumn]) -> list[ColumnPlan]:
    """Build the column plan for a replace, from the user-confirmed types."""
    by_name = {t.name: t.type for t in types}
    if len(types) != len(header) or set(by_name) != set(header):
        raise IngestionError("types must list every column of the file exactly once")
    return [
        ColumnPlan(f"c{i}", name, ColumnType(by_name[name]))
        for i, name in enumerate(header)
    ]


def plan_from_existing(
    header: list[str],
    columns: list[dict[str, Any]],
) -> list[ColumnPlan]:
    """Build the column plan for an append: match by name, order is free."""
    existing = {c["name"] for c in columns}
    missing = [c["name"] for c in columns if c["name"] not in header]
    extra = [h for h in header if h not in existing]
    if missing or extra:
        raise SchemaMismatchError(
            f"Columns do not match the import. Missing: {missing or 'none'}; "
            f"unexpected: {extra or 'none'}"
        )
    # Types are coming from the import, not the file.
    return [ColumnPlan(c["key"], c["name"], ColumnType(c["type"])) for c in columns]


def _next_batch(
    chunks: Iterator[pd.DataFrame],
    plan: list[ColumnPlan],
    ingest_id: str | None,
) -> tuple[list[dict[str, Any]], dict[str, int]] | None:
    """Blocking: read + convert one chunk. Runs in a worker thread."""
    try:
        chunk = next(chunks, None)
    except (pd.errors.ParserError, UnicodeDecodeError) as exc:
        # Parsing errors can surface mid-file, while iterating chunks.
        raise FileReadError(f"Cannot parse file: {exc}") from exc
    if chunk is None:
        return None
    return convert_chunk(chunk, plan, ingest_id)


class IngestionService:
    def __init__(
        self,
        imports: ImportRepository,
        rows: RowRepository,
        chunk_size: int,
    ) -> None:
        self._imports = imports
        self._rows = rows
        self._chunk_size = chunk_size

    async def ingest(
        self,
        import_id: str,
        mode: IngestMode,
        stream: BinaryIO,
        filename: str,
        types: list[DetectedColumn] | None = None,
    ) -> dict[str, Any]:
        oid = parse_object_id(import_id)
        doc = await self._imports.get(oid)
        if doc is None:
            raise ImportNotFoundError(import_id)

        if mode is IngestMode.APPEND and not doc.get("rows_collection"):
            raise IngestionError(
                "This import has no data yet: use mode 'replace' first"
            )

        if mode is IngestMode.REPLACE and types is None:
            # No user-confirmed types: fall back to detection, then rewind.
            detected = await asyncio.to_thread(
                detect_file_types,
                stream,
                filename,
                self._chunk_size,
            )
            types = [DetectedColumn(**d) for d in detected]
            stream.seek(0)

        header, chunks = await asyncio.to_thread(
            read_chunks,
            stream,
            filename,
            self._chunk_size,
        )
        validate_header(header)

        if mode is IngestMode.REPLACE:
            assert types is not None
            return await self._replace(
                oid,
                doc,
                filename,
                plan_from_types(header, types),
                chunks,
            )
        return await self._append(
            oid,
            doc,
            filename,
            plan_from_existing(header, doc["columns"]),
            chunks,
        )

    async def _load(
        self,
        collection: str,
        chunks: Iterator[pd.DataFrame],
        plan: list[ColumnPlan],
        ingest_id: str | None,
    ) -> tuple[int, dict[str, int]]:
        """Stream chunks into `collection`; memory stays bounded by the chunk size."""
        inserted = 0
        rejected = {col.name: 0 for col in plan}
        while (
            batch := await asyncio.to_thread(_next_batch, chunks, plan, ingest_id)
        ) is not None:
            docs, chunk_rejected = batch
            await self._rows.insert_many(collection, docs)
            inserted += len(docs)
            for name, count in chunk_rejected.items():
                rejected[name] += count
        return inserted, rejected

    async def _replace(self, oid, doc, filename, plan, chunks) -> dict[str, Any]:
        # Load into a brand-new collection and
        # only switch the import over once everything succeeded.
        new_collection = f"rows_{oid}_{uuid4().hex[:8]}"
        try:
            inserted, rejected = await self._load(new_collection, chunks, plan, None)
            last_import = self._last_import(
                IngestMode.REPLACE,
                filename,
                inserted,
                rejected,
            )
            old = await self._imports.replace_data(
                oid,
                {
                    "columns": [
                        {"key": c.key, "name": c.name, "type": c.type.value}
                        for c in plan
                    ],
                    "rows_collection": new_collection,
                    "row_count": inserted,
                    # On-demand indexes belonged to the old collection.
                    "indexed_columns": [],
                    "last_import": last_import,
                },
            )
            if old is None:  # the import was deleted while we were loading
                raise ImportNotFoundError(str(oid))
        except BaseException:  # also covers cancellation (client disconnect)
            # shield() lets the cleanup finish even if we are being cancelled.
            await asyncio.shield(self._rows.drop(new_collection))
            raise

        if old.get("rows_collection"):
            try:
                await self._rows.drop(old["rows_collection"])
            except Exception:
                # Harmless orphan collection: the import no longer points to it.
                logger.exception(
                    "Failed to drop old rows collection %s",
                    old["rows_collection"],
                )
        return self._report(IngestMode.REPLACE, filename, inserted, inserted, rejected)

    async def _append(self, oid, doc, filename, plan, chunks) -> dict[str, Any]:
        collection = doc["rows_collection"]
        previous_count = doc["row_count"]  # captured before any write
        ingest_id = uuid4().hex  # tags this append so it can be rolled back
        try:
            inserted, rejected = await self._load(collection, chunks, plan, ingest_id)
            await self._imports.record_append(
                oid,
                inserted,
                self._last_import(IngestMode.APPEND, filename, inserted, rejected),
            )
        except BaseException:
            await asyncio.shield(self._rows.delete_by_ingest(collection, ingest_id))
            raise
        return self._report(
            IngestMode.APPEND,
            filename,
            inserted,
            previous_count + inserted,
            rejected,
        )

    @staticmethod
    def _rejected_list(rejected: dict[str, int]) -> list[dict[str, Any]]:
        # A list, not a dict: column names may contain dots or "$".
        return [{"column": n, "count": c} for n, c in rejected.items() if c > 0]

    def _last_import(self, mode, filename, inserted, rejected) -> dict[str, Any]:
        return {
            "mode": mode.value,
            "filename": filename,
            "at": datetime.now(UTC),
            "rows_inserted": inserted,
            "rejected": self._rejected_list(rejected),
        }

    def _report(self, mode, filename, inserted, row_count, rejected) -> dict[str, Any]:
        return {
            "mode": mode,
            "filename": filename,
            "rows_inserted": inserted,
            "row_count": row_count,
            "rejected": self._rejected_list(rejected),
        }
