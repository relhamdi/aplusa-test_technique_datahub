from collections.abc import AsyncIterator
from typing import Any

from pymongo import ReturnDocument
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

    def _cursor(
        self,
        collection: str,
        match: dict[str, Any],
        sort: list[tuple[str, int]],
        skip: int,
        limit: int,
    ):
        return (
            self._db[collection]
            # Projection: ingest_id is internal and never sent to the client.
            .find(match, {"ingest_id": 0})
            .sort(sort)
            .skip(skip)
            .limit(limit)
            .allow_disk_use(True)
        )

    async def find_page(
        self,
        collection: str,
        match: dict[str, Any],
        sort: list[tuple[str, int]],
        skip: int,
        limit: int,
    ) -> list[dict[str, Any]]:
        return await self._cursor(collection, match, sort, skip, limit).to_list(
            length=limit
        )

    async def iter_page(
        self,
        collection: str,
        match: dict[str, Any],
        sort: list[tuple[str, int]],
        skip: int,
        limit: int,
        batch_size: int,
    ) -> AsyncIterator[dict[str, Any]]:
        """Stream a page document by document, fetched from Mongo in batches.

        Memory stays bounded by batch_size whatever the page size is.
        """
        cursor = self._cursor(collection, match, sort, skip, limit).batch_size(
            batch_size
        )
        try:
            async for doc in cursor:
                yield doc
        finally:
            await cursor.close()

    async def count(self, collection: str, match: dict[str, Any]) -> int:
        return await self._db[collection].count_documents(match)

    async def create_column_index(self, collection: str, key: str) -> None:
        # (field, _id): see build_sort for why _id is part of the index.
        await self._db[collection].create_index(
            [(f"d.{key}", 1), ("_id", 1)], name=f"idx_d_{key}"
        )

    async def update_one_returning(
        self,
        collection: str,
        row_id: Any,
        update: dict[str, Any],
    ) -> dict[str, Any] | None:
        # Returns the document AFTER the update.
        return await self._db[collection].find_one_and_update(
            {"_id": row_id},
            update,
            projection={"ingest_id": 0},
            return_document=ReturnDocument.AFTER,
        )

    async def update_many(
        self,
        collection: str,
        match: dict[str, Any],
        update: dict[str, Any],
    ) -> tuple[int, int]:
        result = await self._db[collection].update_many(match, update)
        return result.matched_count, result.modified_count

    async def delete_many(self, collection: str, match: dict[str, Any]) -> int:
        result = await self._db[collection].delete_many(match)
        return result.deleted_count

    async def aggregate(
        self,
        collection: str,
        pipeline: list[dict[str, Any]],
    ) -> list[dict[str, Any]]:
        cursor = await self._db[collection].aggregate(pipeline, allowDiskUse=True)
        return await cursor.to_list(length=None)
