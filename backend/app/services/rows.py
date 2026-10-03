import asyncio
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any

from app.repositories.imports import ImportRepository
from app.repositories.rows import RowRepository
from app.schemas.query import FilterCondition, RowQuery, SortSpec, StreamQuery
from app.services.imports import ImportNotFoundError, parse_object_id
from app.services.indexing import IndexManager
from app.services.query_builder import build_match, build_sort, index_candidates

# Documents fetched from Mongo per round trip while streaming.
STREAM_BATCH_SIZE = 5_000


def page_window(total: int, page: int, page_size: int) -> tuple[int, int]:
    """Return (skip, number of rows the page really contains).

    The page size is capped by what is left:
    asking for 10M rows out of a 1M-row import simply returns 1M rows.
    """
    skip = (page - 1) * page_size
    return skip, max(0, min(page_size, total - skip))


@dataclass
class _Plan:
    """A validated query, ready to run."""

    doc: dict[str, Any]
    collection: str | None
    match: dict[str, Any]
    sort: list[tuple[str, int]]
    indexing: list[str]


@dataclass
class RowStream:
    meta: dict[str, Any]
    rows: AsyncIterator[dict[str, Any]]


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

    async def _plan(
        self,
        import_id: str,
        filters: list[FilterCondition],
        sort: SortSpec | None,
    ) -> _Plan:
        """Load the import and validate the query. Shared by both endpoints."""
        doc = await self._imports.get(parse_object_id(import_id))
        if doc is None:
            raise ImportNotFoundError(import_id)

        collection = doc.get("rows_collection")
        if not collection:
            return _Plan(doc, None, {}, [("_id", 1)], [])

        columns = {c["key"]: c for c in doc["columns"]}
        match = build_match(filters, columns)  # validates before any I/O
        sort_spec = build_sort(sort, columns)
        indexing = [
            key
            for key in index_candidates(filters, sort)
            if self._indexes.ensure(self._imports, self._rows, doc, key)
        ]
        return _Plan(doc, collection, match, sort_spec, indexing)

    async def query(self, import_id: str, q: RowQuery) -> dict[str, Any]:
        plan = await self._plan(import_id, q.filters, q.sort)
        base = {"page": q.page, "page_size": q.page_size, "indexing": plan.indexing}
        if plan.collection is None:
            return {**base, "rows": [], "total": 0}

        skip, _ = page_window(plan.doc["row_count"], q.page, q.page_size)
        find = self._rows.find_page(
            plan.collection,
            plan.match,
            plan.sort,
            skip,
            q.page_size,
        )
        if plan.match:
            # The filtered total is unavoidable; run it concurrently with the page.
            docs, total = await asyncio.gather(
                find,
                self._rows.count(plan.collection, plan.match),
            )
        else:
            # No filter: the stored counter avoids a full count of 1M documents.
            docs, total = await find, plan.doc["row_count"]

        return {
            **base,
            "total": total,
            "rows": [{"id": str(d["_id"]), "values": d["d"]} for d in docs],
        }

    async def stream(self, import_id: str, q: StreamQuery) -> RowStream:
        """Validate, count, then hand back a lazy row iterator.

        Everything that can fail with a clean HTTP error happens here:
        once streaming begins the status is already sent.
        """
        plan = await self._plan(import_id, q.filters, q.sort)
        if plan.collection is None:
            total = 0
        elif plan.match:
            total = await self._rows.count(plan.collection, plan.match)
        else:
            total = plan.doc["row_count"]

        skip, returned = page_window(total, q.page, q.page_size)
        meta = {
            "total": total,
            "returned": returned,
            "page": q.page,
            "page_size": q.page_size,
            "indexing": plan.indexing,
        }
        return RowStream(meta, self._iter_rows(plan, skip, returned))

    async def _iter_rows(
        self,
        plan: _Plan,
        skip: int,
        limit: int,
    ) -> AsyncIterator[dict[str, Any]]:
        if plan.collection is None or limit == 0:
            return
        async for d in self._rows.iter_page(
            plan.collection, plan.match, plan.sort, skip, limit, STREAM_BATCH_SIZE
        ):
            yield {"id": str(d["_id"]), "values": d["d"]}
