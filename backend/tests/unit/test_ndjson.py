import json
import math

import pytest

from app.api import ndjson
from app.api.ndjson import ndjson_stream
from app.services.rows import page_window


async def collect(stream) -> list[dict]:
    raw = b"".join([chunk async for chunk in stream])
    return [json.loads(line) for line in raw.decode().splitlines()]


async def make_rows(n, fail_at=None, closed=None):
    try:
        for i in range(n):
            if i == fail_at:
                raise RuntimeError("boom")
            yield {"id": str(i), "values": {"c0": i}}
    finally:
        if closed is not None:
            closed.append(True)


async def test_frame_is_meta_rows_done():
    lines = await collect(ndjson_stream({"total": 3}, make_rows(3)))
    assert lines[0] == {"meta": {"total": 3}}
    assert [row["id"] for row in lines[1:-1]] == ["0", "1", "2"]
    assert lines[-1] == {"done": 3}


async def test_empty_page_is_still_a_complete_stream():
    assert await collect(ndjson_stream({}, make_rows(0))) == [{"meta": {}}, {"done": 0}]


async def test_failure_midway_ends_with_error_and_no_done():
    lines = await collect(ndjson_stream({}, make_rows(5, fail_at=2)))
    assert lines[-1] == {"error": "stream interrupted"}
    assert all("done" not in line for line in lines)


async def test_non_ascii_is_kept_as_utf8():
    async def rows():
        yield {"id": "1", "values": {"c0": "Genève 😀"}}

    lines = await collect(ndjson_stream({}, rows()))
    assert lines[1]["values"]["c0"] == "Genève 😀"


async def test_rows_are_flushed_in_bounded_chunks(monkeypatch):
    monkeypatch.setattr(ndjson, "FLUSH_EVERY", 2)
    chunks = [c async for c in ndjson_stream({}, make_rows(5))]
    # meta + ceil(5 / 2) row chunks + done
    assert len(chunks) == 1 + math.ceil(5 / 2) + 1


async def test_closing_the_stream_closes_the_row_iterator(monkeypatch):
    monkeypatch.setattr(ndjson, "FLUSH_EVERY", 1)
    closed: list[bool] = []
    stream = ndjson_stream({}, make_rows(100, closed=closed))
    await anext(stream)  # meta
    await anext(stream)  # first row chunk
    await stream.aclose()  # what happens when the client disconnects
    assert closed == [True]


@pytest.mark.parametrize(
    ("total", "page", "page_size", "expected"),
    [
        (4, 1, 20, (0, 4)),
        (25, 3, 10, (20, 5)),
        (4, 2, 10, (10, 0)),  # page beyond the end
        (0, 1, 10, (0, 0)),
        (1_000_000, 1, 10_000_000, (0, 1_000_000)),  # size larger than the data
        (1_000_000, 2, 1_000_000, (1_000_000, 0)),
    ],
)
def test_page_window(total, page, page_size, expected):
    assert page_window(total, page, page_size) == expected
