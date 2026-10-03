import asyncio
import logging
from typing import Any

from bson import ObjectId

from app.repositories.imports import ImportRepository
from app.repositories.rows import RowRepository

logger = logging.getLogger(__name__)

# Margin on MongoDB's max 64 indexes per collection
MAX_INDEXED_COLUMNS = 60


class IndexManager:
    """Builds per-column indexes in background tasks, without blocking requests.

    The first query on a column runs un-indexed,
    later ones are served by the index.
    """

    def __init__(self) -> None:
        # (rows_collection, column key) -> running build task
        self._tasks: dict[tuple[str, str], asyncio.Task[None]] = {}

    def ensure(
        self,
        imports: ImportRepository,
        rows: RowRepository,
        doc: dict[str, Any],
        key: str,
    ) -> bool:
        """Start a build if needed. Returns True while the index is being built."""
        collection = doc["rows_collection"]
        indexed = doc.get("indexed_columns", [])
        if key in indexed:
            return False
        task_key = (collection, key)
        if task_key in self._tasks:
            return True
        building = sum(1 for c, _ in self._tasks if c == collection)
        if len(indexed) + building >= MAX_INDEXED_COLUMNS:
            return False  # cap reached: queries still work, just without index
        task = asyncio.create_task(
            self._build(imports, rows, doc["_id"], collection, key)
        )
        self._tasks[task_key] = task
        task.add_done_callback(lambda _t, k=task_key: self._tasks.pop(k, None))
        return True

    @staticmethod
    async def _build(
        imports: ImportRepository,
        rows: RowRepository,
        oid: ObjectId,
        collection: str,
        key: str,
    ) -> None:
        try:
            await rows.create_column_index(collection, key)
            await imports.add_indexed_column(oid, collection, key)
        except Exception:
            logger.exception("Index build failed on %s.%s", collection, key)

    async def wait_idle(self) -> None:
        """Wait for running builds."""
        await asyncio.gather(*list(self._tasks.values()), return_exceptions=True)


# Single instance per process (build state must be shared between requests).
index_manager = IndexManager()
