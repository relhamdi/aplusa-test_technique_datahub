import asyncio
from typing import Any

from app.repositories.imports import ImportRepository
from app.repositories.rows import RowRepository
from app.schemas.stats import StatsRequest
from app.services.imports import ImportNotFoundError, parse_object_id
from app.services.indexing import IndexManager
from app.services.query_builder import build_match, get_column, index_candidates
from app.services.stats_builder import (
    groups_pipeline,
    parse_groups,
    parse_summary,
    summary_pipeline,
)
from app.services.type_detection import ColumnType


class StatsService:
    def __init__(
        self,
        imports: ImportRepository,
        rows: RowRepository,
        indexes: IndexManager,
    ):
        self._imports = imports
        self._rows = rows
        self._indexes = indexes

    async def compute(self, import_id: str, req: StatsRequest) -> dict[str, Any]:
        doc = await self._imports.get(parse_object_id(import_id))
        if doc is None:
            raise ImportNotFoundError(import_id)

        columns = {c["key"]: c for c in doc["columns"]}
        col = get_column(req.column, columns)
        col_type = ColumnType(col["type"])

        # Build and validate every pipeline before any I/O.
        data_filters = req.data_filters if req.apply_data_filters else []
        scope = build_match(data_filters, columns)
        summary_pipe = summary_pipeline(col, scope)
        table_pipe = (
            None
            if col_type is ColumnType.BOOLEAN  # a boolean has no value/occurrence table
            else groups_pipeline(
                col, scope, req.value_filters, req.sort, req.page, req.page_size
            )
        )

        collection = doc.get("rows_collection")
        indexing: list[str] = []
        summary_docs: list[dict[str, Any]] = []
        table_docs: list[dict[str, Any]] = []
        if collection:
            # An index on the stats column (and on filtered columns)
            # lets the $group read the index instead of every document.
            keys = dict.fromkeys([col["key"], *index_candidates(data_filters, None)])
            indexing = [
                k
                for k in keys
                if self._indexes.ensure(self._imports, self._rows, doc, k)
            ]
            # Both aggregations are independent: run them concurrently.
            summary_docs, table_docs = await asyncio.gather(
                self._rows.aggregate(collection, summary_pipe),
                self._aggregate_or_empty(collection, table_pipe),
            )

        out = {
            "column": col["key"],
            "type": col_type.value,
            "indexing": indexing,
            "table": None,
            **parse_summary(col_type, summary_docs),
        }
        if table_pipe is not None:
            rows, groups, occurrences = parse_groups(table_docs)
            out["table"] = {
                "rows": rows,
                "total": groups,
                "page": req.page,
                "page_size": req.page_size,
            }
            if req.apply_value_filters and col_type is ColumnType.STRING:
                # The global count only covers the filtered values.
                out["count"] = occurrences
        return out

    async def _aggregate_or_empty(
        self,
        collection: str,
        pipeline: list[dict[str, Any]] | None,
    ) -> list[dict[str, Any]]:
        return await self._rows.aggregate(collection, pipeline) if pipeline else []
