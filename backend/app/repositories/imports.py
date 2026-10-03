from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from pymongo import ReturnDocument, UpdateOne
from pymongo.asynchronous.database import AsyncDatabase


class ImportRepository:
    """Mongo access for the `imports` collection."""

    def __init__(self, db: AsyncDatabase) -> None:
        self._db = db
        self._col = db["imports"]

    async def list_all(self) -> list[dict[str, Any]]:
        # Served by idx_imports_order.
        return await self._col.find().sort("order", 1).to_list(length=None)

    async def get(self, import_id: ObjectId) -> dict[str, Any] | None:
        return await self._col.find_one({"_id": import_id})

    async def next_order(self) -> int:
        last = await self._col.find_one(sort=[("order", -1)], projection={"order": 1})
        return (last["order"] + 1) if last else 0

    async def insert(self, name: str, description: str) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "name": name,
            "description": description,
            "order": await self.next_order(),
            "columns": [],
            "rows_collection": None,  # set on first ingestion
            "row_count": 0,
            "indexed_columns": [],
            "last_import": None,
            "created_at": now,
            "updated_at": now,
        }
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def update_fields(
        self,
        import_id: ObjectId,
        fields: dict[str, Any],
    ) -> dict[str, Any] | None:
        fields["updated_at"] = datetime.now(UTC)
        return await self._col.find_one_and_update(
            {"_id": import_id}, {"$set": fields}, return_document=True
        )

    async def delete(self, import_id: ObjectId) -> dict[str, Any] | None:
        # Returns the deleted document so the service can drop its rows collection.
        return await self._col.find_one_and_delete({"_id": import_id})

    async def set_orders(self, ordered_ids: list[ObjectId]) -> None:
        # One bulk_write instead of N round trips.
        ops = [
            UpdateOne({"_id": oid}, {"$set": {"order": idx}})
            for idx, oid in enumerate(ordered_ids)
        ]
        await self._col.bulk_write(ops, ordered=False)

    async def count(self) -> int:
        return await self._col.count_documents({})

    async def drop_rows_collection(self, name: str) -> None:
        await self._db.drop_collection(name)

    async def replace_data(
        self, import_id: ObjectId, fields: dict[str, Any]
    ) -> dict[str, Any] | None:
        """Atomically point the import at its new rows collection.

        Returns the document as it was BEFORE the swap, 
        so the caller can drop the previous rows collection. 
        """
        fields["updated_at"] = datetime.now(UTC)
        return await self._col.find_one_and_update(
            {"_id": import_id},
            {"$set": fields},
            return_document=ReturnDocument.BEFORE,
        )

    async def record_append(
        self, import_id: ObjectId, inserted: int, last_import: dict[str, Any]
    ) -> None:
        await self._col.update_one(
            {"_id": import_id},
            {
                "$inc": {"row_count": inserted},
                "$set": {"last_import": last_import, "updated_at": datetime.now(UTC)},
            },
        )
