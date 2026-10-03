from typing import Any

from pymongo.asynchronous.database import AsyncDatabase


class RowRepository:
    """Mongo access to the per-import rows collections."""

    def __init__(self, db: AsyncDatabase) -> None:
        self._db = db

    async def insert_many(self, collection: str, docs: list[dict[str, Any]]) -> None:
        if docs:
            # ordered=False lets the server process batches without stopping at the first error,
            # faster for bulk loads.
            await self._db[collection].insert_many(docs, ordered=False)

    async def delete_by_ingest(self, collection: str, ingest_id: str) -> None:
        await self._db[collection].delete_many({"ingest_id": ingest_id})

    async def drop(self, collection: str) -> None:
        await self._db.drop_collection(collection)
