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

    async def find_page(
        self,
        collection: str,
        match: dict[str, Any],
        sort: list[tuple[str, int]],
        skip: int,
        limit: int,
    ) -> list[dict[str, Any]]:
        cursor = (
            self._db[collection]
            # Projection: ingest_id is internal and never sent to the client.
            .find(match, {"ingest_id": 0})
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .allow_disk_use(True)
        )
        return await cursor.to_list(length=limit)

    async def count(self, collection: str, match: dict[str, Any]) -> int:
        return await self._db[collection].count_documents(match)

    async def create_column_index(self, collection: str, key: str) -> None:
        # (field, _id): see build_sort for why _id is part of the index.
        await self._db[collection].create_index(
            [(f"d.{key}", 1), ("_id", 1)], name=f"idx_d_{key}"
        )
