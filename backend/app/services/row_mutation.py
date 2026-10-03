from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

from app.repositories.imports import ImportRepository
from app.repositories.rows import RowRepository
from app.schemas.mutation import BatchDelete, BatchUpdate, RowUpdate
from app.services.imports import ImportNotFoundError, parse_object_id
from app.services.mutation_builder import (
    build_batch_update,
    build_row_update,
    build_selection_match,
)


class RowNotFoundError(Exception):
    pass


class RowMutationService:
    def __init__(self, imports: ImportRepository, rows: RowRepository) -> None:
        self._imports = imports
        self._rows = rows

    async def _load(
        self,
        import_id: str,
    ) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
        doc = await self._imports.get(parse_object_id(import_id))
        if doc is None:
            raise ImportNotFoundError(import_id)
        return doc, {c["key"]: c for c in doc["columns"]}

    async def update_row(
        self,
        import_id: str,
        row_id: str,
        payload: RowUpdate,
    ) -> dict[str, Any]:
        doc, columns = await self._load(import_id)
        update = build_row_update(payload.values, columns)  # validate before any write
        try:
            oid = ObjectId(row_id)
        except (InvalidId, TypeError) as exc:
            raise RowNotFoundError(row_id) from exc
        if not doc.get("rows_collection"):
            raise RowNotFoundError(row_id)
        updated = await self._rows.update_one_returning(
            doc["rows_collection"], oid, update
        )
        if updated is None:
            raise RowNotFoundError(row_id)
        return {"id": str(updated["_id"]), "values": updated["d"]}

    async def batch_update(
        self,
        import_id: str,
        payload: BatchUpdate,
    ) -> dict[str, int]:
        doc, columns = await self._load(import_id)
        match = build_selection_match(payload.selection, columns)
        update = build_batch_update(payload.fields, columns)
        if not doc.get("rows_collection"):
            return {"matched": 0, "affected": 0}
        # One update_many: atomic per document, NOT across the whole batch.
        matched, modified = await self._rows.update_many(
            doc["rows_collection"], match, update
        )
        return {"matched": matched, "affected": modified}

    async def batch_delete(
        self,
        import_id: str,
        payload: BatchDelete,
    ) -> dict[str, int]:
        doc, columns = await self._load(import_id)
        match = build_selection_match(payload.selection, columns)
        collection = doc.get("rows_collection")
        if not collection:
            return {"matched": 0, "affected": 0}
        deleted = await self._rows.delete_many(collection, match)
        if deleted:
            # Keep the stored counter exact: unfiltered pages rely on it as total.
            await self._imports.adjust_row_count(doc["_id"], collection, -deleted)
        return {"matched": deleted, "affected": deleted}
