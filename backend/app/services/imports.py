import logging
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

from app.repositories.imports import ImportRepository
from app.schemas.imports import ImportCreate, ImportUpdate

logger = logging.getLogger(__name__)


class ImportNotFoundError(Exception):
    pass


class InvalidReorderError(Exception):
    pass


def parse_object_id(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError) as exc:
        # Treated as "not found" to avoid leaking id format details
        raise ImportNotFoundError(value) from exc


def to_out(doc: dict[str, Any]) -> dict[str, Any]:
    """Map a Mongo document to the API representation."""
    return {**doc, "id": str(doc["_id"])}


class ImportService:
    def __init__(self, repo: ImportRepository) -> None:
        self._repo = repo

    async def list_imports(self) -> list[dict[str, Any]]:
        return [to_out(d) for d in await self._repo.list_all()]

    async def create(self, payload: ImportCreate) -> dict[str, Any]:
        doc = await self._repo.insert(payload.name.strip(), payload.description)
        return to_out(doc)

    async def get(self, import_id: str) -> dict[str, Any]:
        doc = await self._repo.get(parse_object_id(import_id))
        if doc is None:
            raise ImportNotFoundError(import_id)
        return to_out(doc)

    async def update(self, import_id: str, payload: ImportUpdate) -> dict[str, Any]:
        # exclude_unset used to update only sent fields
        fields = payload.model_dump(exclude_unset=True, exclude_none=True)
        oid = parse_object_id(import_id)
        doc = (
            await self._repo.update_fields(oid, fields)
            if fields
            else await self._repo.get(oid)
        )
        if doc is None:
            raise ImportNotFoundError(import_id)
        return to_out(doc)

    async def delete(self, import_id: str) -> None:
        # Delete metadata first, then drop rows:
        # a failed drop leaves a harmless orphan collection,
        # whereas the opposite order would leave an import pointing to a missing collection.
        doc = await self._repo.delete(parse_object_id(import_id))
        if doc is None:
            raise ImportNotFoundError(import_id)
        rows_collection = doc.get("rows_collection")
        if rows_collection:
            try:
                await self._repo.drop_rows_collection(rows_collection)
            except Exception:
                logger.exception("Failed to drop rows collection %s", rows_collection)

    async def reorder(self, ids: list[str]) -> list[dict[str, Any]]:
        oids = [parse_object_id(i) for i in ids]
        # The client must send every import exactly once, 
        # otherwise `order` values could collide or leave gaps.
        if len(set(oids)) != len(oids) or len(oids) != await self._repo.count():
            raise InvalidReorderError("ids must list every import exactly once")
        await self._repo.set_orders(oids)
        return await self.list_imports()
