import pytest
from bson import ObjectId

from app.schemas.imports import ImportCreate, ImportUpdate
from app.services.imports import (
    ImportNotFoundError,
    ImportService,
    InvalidReorderError,
)


class FakeRepo:
    """In-memory stand-in for ImportRepository"""

    def __init__(self) -> None:
        self.docs: dict[ObjectId, dict] = {}
        self.dropped: list[str] = []

    async def list_all(self):
        return sorted(self.docs.values(), key=lambda d: d["order"])

    async def get(self, oid):
        return self.docs.get(oid)

    async def insert(self, name, description):
        oid = ObjectId()
        doc = {
            "_id": oid,
            "name": name,
            "description": description,
            "order": len(self.docs),
            "columns": [],
            "rows_collection": None,
            "row_count": 0,
        }
        self.docs[oid] = doc
        return doc

    async def update_fields(self, oid, fields):
        if oid not in self.docs:
            return None
        self.docs[oid].update(fields)
        return self.docs[oid]

    async def delete(self, oid):
        return self.docs.pop(oid, None)

    async def set_orders(self, ordered):
        for idx, oid in enumerate(ordered):
            self.docs[oid]["order"] = idx

    async def count(self):
        return len(self.docs)

    async def drop_rows_collection(self, name):
        self.dropped.append(name)


@pytest.fixture
def service():
    return ImportService(FakeRepo())


async def test_create_strips_name(service):
    out = await service.create(ImportCreate(name="  Sales  "))
    assert out["name"] == "Sales"


async def test_update_only_sent_fields(service):
    created = await service.create(ImportCreate(name="A", description="d"))
    out = await service.update(created["id"], ImportUpdate(name="B"))
    assert out["name"] == "B" and out["description"] == "d"


async def test_get_unknown_or_malformed_id_raises(service):
    with pytest.raises(ImportNotFoundError):
        await service.get(str(ObjectId()))
    with pytest.raises(ImportNotFoundError):
        await service.get("not-an-object-id")


async def test_delete_drops_rows_collection(service):
    created = await service.create(ImportCreate(name="A"))
    service._repo.docs[ObjectId(created["id"])]["rows_collection"] = "rows_x_1"
    await service.delete(created["id"])
    assert service._repo.dropped == ["rows_x_1"]


async def test_reorder_applies_order(service):
    a = await service.create(ImportCreate(name="A"))
    b = await service.create(ImportCreate(name="B"))
    out = await service.reorder([b["id"], a["id"]])
    assert [i["name"] for i in out] == ["B", "A"]


async def test_reorder_rejects_partial_or_duplicate_lists(service):
    a = await service.create(ImportCreate(name="A"))
    await service.create(ImportCreate(name="B"))
    with pytest.raises(InvalidReorderError):
        await service.reorder([a["id"]])
    with pytest.raises(InvalidReorderError):
        await service.reorder([a["id"], a["id"]])
