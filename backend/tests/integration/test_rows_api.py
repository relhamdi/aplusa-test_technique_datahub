from app.core.database import database
from app.services.indexing import index_manager
from bson import ObjectId

from tests.integration.helpers import seed_import


async def _query(client, import_id, **body):
    return await client.post(f"/imports/{import_id}/rows/query", json=body)


def _ids(response) -> list:
    return [row["values"]["c0"] for row in response.json()["rows"]]


async def test_default_page_uses_stored_count(client):
    import_id = await seed_import(client)
    r = await _query(client, import_id)
    assert r.status_code == 200
    assert r.json()["total"] == 4 and _ids(r) == [1, 2, 3, 4]


async def test_sort_desc(client):
    import_id = await seed_import(client)
    r = await _query(client, import_id, sort={"column": "c0", "direction": "desc"})
    assert _ids(r) == [4, 3, 2, 1]


async def test_filters_are_anded_and_total_reflects_them(client):
    import_id = await seed_import(client)
    r = await _query(
        client,
        import_id,
        filters=[{"column": "c1", "op": "contains", "value": "APPLE"}],
    )
    assert r.json()["total"] == 2

    r = await _query(
        client,
        import_id,
        filters=[
            {"column": "c1", "op": "contains", "value": "apple"},
            {"column": "c0", "op": "between", "value": 2, "value_to": 4},
        ],
    )
    assert _ids(r) == [4]


async def test_is_empty_filter(client):
    import_id = await seed_import(client)
    r = await _query(client, import_id, filters=[{"column": "c2", "op": "is_empty"}])
    assert _ids(r) == [3]


async def test_page_beyond_the_end_is_empty(client):
    import_id = await seed_import(client)
    r = await _query(client, import_id, page=2, page_size=10)
    assert r.json()["rows"] == [] and r.json()["total"] == 4


async def test_invalid_query_returns_422(client):
    import_id = await seed_import(client)
    r = await _query(
        client, import_id, filters=[{"column": "zz", "op": "equals", "value": 1}]
    )
    assert r.status_code == 422
    assert (await _query(client, import_id, page_size=7)).status_code == 422


async def test_unknown_import_returns_404(client):
    assert (await _query(client, str(ObjectId()))).status_code == 404


async def test_sorting_builds_the_index_in_background(client):
    import_id = await seed_import(client)
    r = await _query(client, import_id, sort={"column": "c0"})
    assert r.json()["indexing"] == ["c0"]  # the query ran anyway

    await index_manager.wait_idle()
    doc = await database.db["imports"].find_one({"_id": ObjectId(import_id)})
    assert doc["indexed_columns"] == ["c0"]
    indexes = await database.db[doc["rows_collection"]].index_information()
    assert "idx_d_c0" in indexes

    r = await _query(client, import_id, sort={"column": "c0"})
    assert r.json()["indexing"] == []
