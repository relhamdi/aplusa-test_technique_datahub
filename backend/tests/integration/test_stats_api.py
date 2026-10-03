from bson import ObjectId

from tests.integration.helpers import seed_import

# c0=n (integer), c1=label (string), c2=flag (boolean), c3=price (float)
CSV = b"n,label,flag,price\n1,a,oui,1.5\n2,b,non,2.5\n3,a,oui,\n4,a,,4.0\n5,c,non,2.5\n"


async def _stats(client, import_id, **body):
    r = await client.post(f"/imports/{import_id}/stats", json=body)
    assert r.status_code == 200, r.text
    return r.json()


async def test_boolean_stats(client):
    import_id = await seed_import(client, CSV)
    out = await _stats(client, import_id, column="c2")
    assert out["count"] == 4 and out["empty_count"] == 1
    assert out["boolean"] == {
        "true_count": 2,
        "false_count": 2,
        "true_percent": 50.0,
        "false_percent": 50.0,
    }
    assert out["table"] is None


async def test_numeric_stats_with_value_table(client):
    import_id = await seed_import(client, CSV)
    out = await _stats(client, import_id, column="c3")
    assert out["count"] == 4 and out["empty_count"] == 1
    assert out["numeric"] == {"min": 1.5, "max": 4.0, "avg": 2.625}
    assert out["table"]["rows"][0] == {"value": 2.5, "count": 2}  # most frequent first
    assert out["table"]["total"] == 3


async def test_string_stats_default_order(client):
    import_id = await seed_import(client, CSV)
    out = await _stats(client, import_id, column="c1")
    assert out["count"] == 5
    assert out["table"]["rows"] == [
        {"value": "a", "count": 3},
        {"value": "b", "count": 1},
        {"value": "c", "count": 1},
    ]


async def test_string_table_sort_by_value_and_pagination(client):
    import_id = await seed_import(client, CSV)
    out = await _stats(
        client,
        import_id,
        column="c1",
        page=2,
        page_size=10,
        sort={"target": "value", "direction": "desc"},
    )
    assert out["table"]["rows"] == [] and out["table"]["total"] == 3


async def test_checkbox_1_applies_data_filters(client):
    import_id = await seed_import(client, CSV)
    data_filters = [{"column": "c0", "op": "gt", "value": 2}]

    applied = await _stats(
        client,
        import_id,
        column="c1",
        apply_data_filters=True,
        data_filters=data_filters,
    )
    assert applied["count"] == 3
    assert applied["table"]["rows"][0] == {"value": "a", "count": 2}
    
    ignored = await _stats(
        client,
        import_id,
        column="c1",
        apply_data_filters=False,
        data_filters=data_filters,
    )
    assert ignored["count"] == 5


async def test_checkbox_2_restricts_the_global_count(client):
    import_id = await seed_import(client, CSV)
    value_filters = [{"target": "count", "op": "gt", "value": 1}]

    applied = await _stats(
        client,
        import_id,
        column="c1",
        value_filters=value_filters,
        apply_value_filters=True,
    )
    assert applied["table"]["rows"] == [{"value": "a", "count": 3}]
    assert applied["count"] == 3

    # Unticked: the table is still filtered, the global count is not.
    unticked = await _stats(
        client,
        import_id,
        column="c1",
        value_filters=value_filters,
        apply_value_filters=False,
    )
    assert unticked["table"]["rows"] == [{"value": "a", "count": 3}]
    assert unticked["count"] == 5


async def test_value_filter_on_the_value_column(client):
    import_id = await seed_import(client, CSV)
    out = await _stats(
        client,
        import_id,
        column="c1",
        value_filters=[{"target": "value", "op": "starts_with", "value": "b"}],
    )
    assert out["table"]["rows"] == [{"value": "b", "count": 1}]


async def test_stats_on_import_without_data(client):
    import_id = (await client.post("/imports", json={"name": "empty"})).json()["id"]
    # No columns yet: the column cannot exist.
    r = await client.post(f"/imports/{import_id}/stats", json={"column": "c0"})
    assert r.status_code == 422


async def test_invalid_requests(client):
    import_id = await seed_import(client, CSV)
    for body in (
        {"column": "zz"},
        {"column": "c1", "value_filters": [{"target": "value", "op": "is_empty"}]},
        {
            "column": "c1",
            "value_filters": [{"target": "count", "op": "equals", "value": "x"}],
        },
    ):
        r = await client.post(f"/imports/{import_id}/stats", json=body)
        assert r.status_code == 422
    assert (
        await client.post(f"/imports/{ObjectId()}/stats", json={"column": "c0"})
    ).status_code == 404
