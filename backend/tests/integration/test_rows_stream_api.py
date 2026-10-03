import json

from bson import ObjectId

from tests.integration.helpers import seed_import

# c0 = n (integer), 25 rows
CSV = ("n\n" + "\n".join(str(i) for i in range(2, 27))).encode()


async def _stream(client, import_id, **body):
    r = await client.post(f"/imports/{import_id}/rows/stream", json=body)
    return r, [json.loads(line) for line in r.text.splitlines()]


async def test_stream_frame_and_media_type(client):
    import_id = await seed_import(client)  # default 4-row CSV
    r, lines = await _stream(client, import_id)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("application/x-ndjson")
    assert lines[0]["meta"] == {
        "total": 4,
        "returned": 4,
        "page": 1,
        "page_size": 20,
        "indexing": [],
    }
    assert [row["values"]["c0"] for row in lines[1:-1]] == [1, 2, 3, 4]
    assert lines[-1] == {"done": 4}


async def test_huge_page_size_is_capped_to_the_data(client):
    import_id = await seed_import(client)
    _, lines = await _stream(client, import_id, page_size=10_000_000)
    assert lines[0]["meta"]["returned"] == 4 and lines[-1] == {"done": 4}


async def test_second_page_with_sort_desc(client):
    import_id = await seed_import(client, CSV)
    _, lines = await _stream(
        client,
        import_id,
        page=2,
        page_size=10,
        sort={"column": "c0", "direction": "desc"},
    )
    assert lines[0]["meta"]["returned"] == 10
    assert [row["values"]["c0"] for row in lines[1:-1]] == list(range(16, 6, -1))


async def test_stream_honours_filters_and_total(client):
    import_id = await seed_import(client, CSV)
    _, lines = await _stream(
        client, import_id, filters=[{"column": "c0", "op": "gt", "value": 20}]
    )
    assert lines[0]["meta"]["total"] == 6 and lines[-1] == {"done": 6}


async def test_page_beyond_the_end_is_an_empty_but_complete_stream(client):
    import_id = await seed_import(client)
    _, lines = await _stream(client, import_id, page=2, page_size=10)
    assert lines[0]["meta"]["returned"] == 0 and lines[-1] == {"done": 0}


async def test_errors_are_real_http_errors_not_stream_lines(client):
    import_id = await seed_import(client)
    r, _ = await _stream(
        client,
        import_id,
        filters=[{"column": "zz", "op": "equals", "value": 1}],
    )
    assert r.status_code == 422
    r, _ = await _stream(client, import_id, page_size=7)
    assert r.status_code == 422
    r, _ = await _stream(client, str(ObjectId()))
    assert r.status_code == 404
