from bson import ObjectId

from tests.integration.helpers import fetch_rows, seed_import


def _by_id(rows: list[dict]) -> dict[int, dict]:
    return {r["values"]["c0"]: r for r in rows}


async def test_edit_row(client):
    import_id = await seed_import(client)
    row = _by_id(await fetch_rows(client, import_id))[1]

    r = await client.patch(
        f"/imports/{import_id}/rows/{row['id']}",
        json={"values": {"c1": "avocado", "c2": None}},
    )
    assert r.status_code == 200
    assert r.json()["values"] == {"c0": 1, "c1": "avocado", "c2": None}


async def test_edit_with_invalid_value_returns_422_and_changes_nothing(client):
    import_id = await seed_import(client)
    row = _by_id(await fetch_rows(client, import_id))[1]

    r = await client.patch(
        f"/imports/{import_id}/rows/{row['id']}", json={"values": {"c0": "abc"}}
    )
    assert r.status_code == 422
    assert _by_id(await fetch_rows(client, import_id))[1]["values"]["c0"] == 1


async def test_edit_unknown_or_malformed_row_returns_404(client):
    import_id = await seed_import(client)
    for row_id in (str(ObjectId()), "not-an-id"):
        r = await client.patch(
            f"/imports/{import_id}/rows/{row_id}", json={"values": {"c1": "x"}}
        )
        assert r.status_code == 404


async def test_batch_update_by_ids(client):
    import_id = await seed_import(client)
    rows = _by_id(await fetch_rows(client, import_id))
    ids = [rows[1]["id"], rows[2]["id"]]

    r = await client.post(
        f"/imports/{import_id}/rows/batch-update",
        json={
            "selection": {"mode": "ids", "ids": ids},
            "fields": {
                "c0": {"action": "keep"},
                "c1": {"action": "set", "value": "x"},
                "c2": {"action": "clear"},
            },
        },
    )
    assert r.json() == {"matched": 2, "affected": 2}

    after = _by_id(await fetch_rows(client, import_id))
    assert after[1]["values"] == {"c0": 1, "c1": "x", "c2": None}
    assert after[3]["values"]["c1"] == "cherry"  # not selected: untouched


async def test_batch_update_filter_mode_honours_exclusions(client):
    import_id = await seed_import(client)
    rows = _by_id(await fetch_rows(client, import_id))

    r = await client.post(
        f"/imports/{import_id}/rows/batch-update",
        json={
            "selection": {
                "mode": "filter",
                "filters": [{"column": "c1", "op": "contains", "value": "apple"}],
                "excluded_ids": [rows[4]["id"]],  # "select all", then untick row 4
            },
            "fields": {"c1": {"action": "set", "value": "fruit"}},
        },
    )
    assert r.json()["matched"] == 1
    after = _by_id(await fetch_rows(client, import_id))
    assert (
        after[1]["values"]["c1"] == "fruit" and after[4]["values"]["c1"] == "apple pie"
    )


async def test_batch_update_with_only_keep_returns_422(client):
    import_id = await seed_import(client)
    r = await client.post(
        f"/imports/{import_id}/rows/batch-update",
        json={"selection": {"mode": "filter"}, "fields": {"c0": {"action": "keep"}}},
    )
    assert r.status_code == 422


async def test_batch_delete_keeps_row_count_exact(client):
    import_id = await seed_import(client)

    r = await client.post(
        f"/imports/{import_id}/rows/batch-delete",
        json={
            "selection": {
                "mode": "filter",
                "filters": [{"column": "c0", "op": "gt", "value": 2}],
            }
        },
    )
    assert r.json() == {"matched": 2, "affected": 2}

    assert (await client.get(f"/imports/{import_id}")).json()["row_count"] == 2
    page = (await client.post(f"/imports/{import_id}/rows/query", json={})).json()
    assert page["total"] == 2  # unfiltered total comes from the stored counter
