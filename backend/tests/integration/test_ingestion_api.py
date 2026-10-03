from app.core.database import database
from bson import ObjectId


async def _create(client) -> str:
    return (await client.post("/imports", json={"name": "T"})).json()["id"]


def _file(content: bytes, name: str = "f.csv"):
    return {"file": (name, content, "text/csv")}


async def test_replace_then_append(client):
    import_id = await _create(client)

    r = await client.post(
        f"/imports/{import_id}/data",
        data={"mode": "replace"},
        files=_file(b"a;b\n1;x\n2;y\n"),
    )
    assert r.status_code == 200 and r.json()["rows_inserted"] == 2

    doc = (await client.get(f"/imports/{import_id}")).json()
    assert doc["row_count"] == 2
    assert [c["type"] for c in doc["columns"]] == ["integer", "string"]

    r = await client.post(
        f"/imports/{import_id}/data",
        data={"mode": "append"},
        files=_file(b"b;a\nz;3\n"),
    )
    assert r.status_code == 200 and r.json()["row_count"] == 3


async def test_append_with_wrong_columns_returns_409(client):
    import_id = await _create(client)
    await client.post(
        f"/imports/{import_id}/data",
        data={"mode": "replace"},
        files=_file(b"a\n1\n"),
    )
    r = await client.post(
        f"/imports/{import_id}/data",
        data={"mode": "append"},
        files=_file(b"zzz\n1\n"),
    )
    assert r.status_code == 409


async def test_append_on_empty_import_returns_400(client):
    import_id = await _create(client)
    r = await client.post(
        f"/imports/{import_id}/data",
        data={"mode": "append"},
        files=_file(b"a\n1\n"),
    )
    assert r.status_code == 400


async def test_replace_with_user_types(client):
    import_id = await _create(client)
    types = '[{"name":"a","type":"string"}]'
    r = await client.post(
        f"/imports/{import_id}/data",
        data={"mode": "replace", "types": types},
        files=_file(b"a\n1\n2\n"),
    )
    assert r.status_code == 200
    doc = (await client.get(f"/imports/{import_id}")).json()
    assert doc["columns"][0]["type"] == "string"
    stored = await database.db[(await _rows_collection(import_id))].find_one()
    assert stored["d"]["c0"] == "1"


async def _rows_collection(import_id: str) -> str:
    doc = await database.db["imports"].find_one({"_id": ObjectId(import_id)})
    return doc["rows_collection"]
