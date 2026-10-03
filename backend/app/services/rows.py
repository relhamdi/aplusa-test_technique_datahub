import asyncio
from typing import Any

from app.repositories.imports import ImportRepository
from app.repositories.rows import RowRepository
from app.schemas.query import RowQuery
from app.services.imports import ImportNotFoundError, parse_object_id
from app.services.indexing import IndexManager
from app.services.query_builder import build_match, build_sort, index_candidates


class RowQueryService:
    def __init__(
        self,
        imports: ImportRepository,
        rows: RowRepository,
        indexes: IndexManager,
    ):
        self._imports = imports
        self._rows = rows
        self._indexes = indexes

    async def query(self, import_id: str, q: RowQuery) -> dict[str, Any]:
        doc = await self._imports.get(parse_object_id(import_id))
        if doc is None:
            raise ImportNotFoundError(import_id)

        base = {"page": q.page, "page_size": q.page_size, "indexing": []}
        collection = doc.get("rows_collection")
        if not collection:
            return {**base, "rows": [], "total": 0}

        columns = {c["key"]: c for c in doc["columns"]}
        match = build_match(q.filters, columns)  # validates before any I/O
        sort = build_sort(q.sort, columns)
        indexing = [
            key
            for key in index_candidates(q.filters, q.sort)
            if self._indexes.ensure(self._imports, self._rows, doc, key)
        ]

        skip = (q.page - 1) * q.page_size
        find = self._rows.find_page(collection, match, sort, skip, q.page_size)
        if match:
            # The filtered total is unavoidable; run it concurrently with the page.
            docs, total = await asyncio.gather(
                find,
                self._rows.count(collection, match),
            )
        else:
            # No filter: the stored counter avoids a full count of 1M documents.
            docs, total = await find, doc["row_count"]

        return {
            **base,
            "indexing": indexing,
            "total": total,
            "rows": [{"id": str(d["_id"]), "values": d["d"]} for d in docs],
        }
