import io

import pytest
from app.schemas.ingestion import IngestMode
from app.services.ingestion import IngestionService, SchemaMismatchError
from bson import ObjectId


class FakeRows:
    def __init__(self, fail_on_call: int | None = None) -> None:
        self.collections: dict[str, list[dict]] = {}
        self.calls = 0
        self.fail_on_call = fail_on_call

    async def insert_many(self, collection, docs):
        self.calls += 1
        if self.calls == self.fail_on_call:
            raise RuntimeError("boom")
        self.collections.setdefault(collection, []).extend(docs)

    async def delete_by_ingest(self, collection, ingest_id):
        rows = self.collections.get(collection, [])
        self.collections[collection] = [
            r for r in rows if r.get("ingest_id") != ingest_id
        ]

    async def drop(self, collection):
        self.collections.pop(collection, None)


class FakeImports:
    def __init__(self, doc):
        self.doc = doc

    async def get(self, oid):
        # Return a copy, like a real database:
        # callers must not share state with the stored document.
        return dict(self.doc) if oid == self.doc["_id"] else None

    async def replace_data(self, oid, fields):
        old = dict(self.doc)
        self.doc.update(fields)
        return old

    async def record_append(self, oid, inserted, last_import):
        self.doc["row_count"] += inserted
        self.doc["last_import"] = last_import


def make(rows: FakeRows, **doc_overrides):
    doc = {"_id": ObjectId(), "columns": [], "rows_collection": None, "row_count": 0}
    doc.update(doc_overrides)
    imports = FakeImports(doc)
    return IngestionService(imports, rows, chunk_size=2), imports, str(doc["_id"])


def upload(content: str) -> io.BytesIO:
    return io.BytesIO(content.encode())


async def test_replace_detects_types_stores_typed_rows_and_drops_old():
    rows = FakeRows()
    rows.collections["rows_old"] = [{"d": {}}]
    service, imports, oid = make(rows, rows_collection="rows_old", row_count=1)

    report = await service.ingest(
        oid,
        IngestMode.REPLACE,
        upload("a,b\n1,x\n2,y\n3,\n"),
        "f.csv",
    )

    assert report["rows_inserted"] == 3
    assert imports.doc["row_count"] == 3
    assert [c["type"] for c in imports.doc["columns"]] == ["integer", "string"]
    assert "rows_old" not in rows.collections
    stored = rows.collections[imports.doc["rows_collection"]]
    assert stored[0]["d"] == {"c0": 1, "c1": "x"} and stored[2]["d"]["c1"] is None


async def test_replace_failure_keeps_old_data_and_drops_new_collection():
    rows = FakeRows(fail_on_call=2)  # fails on the second chunk
    rows.collections["rows_old"] = [{"d": {}}]
    service, imports, oid = make(rows, rows_collection="rows_old", row_count=1)

    with pytest.raises(RuntimeError):
        await service.ingest(oid, IngestMode.REPLACE, upload("a\n1\n2\n3\n"), "f.csv")

    assert imports.doc["rows_collection"] == "rows_old"
    assert list(rows.collections) == ["rows_old"]


async def _seeded_import(rows):
    service, imports, oid = make(rows)
    await service.ingest(oid, IngestMode.REPLACE, upload("a,b\n5,x\n"), "f.csv")
    return service, imports, oid


async def test_append_matches_columns_by_name_in_any_order():
    rows = FakeRows()
    service, imports, oid = await _seeded_import(rows)

    report = await service.ingest(oid, IngestMode.APPEND, upload("b,a\nz,9\n"), "g.csv")

    assert report["row_count"] == 2 and imports.doc["row_count"] == 2
    assert rows.collections[imports.doc["rows_collection"]][-1]["d"] == {
        "c0": 9,
        "c1": "z",
    }


async def test_append_counts_rejected_values():
    rows = FakeRows()
    service, _, oid = await _seeded_import(rows)

    report = await service.ingest(
        oid,
        IngestMode.APPEND,
        upload("a,b\nnope,z\n"),
        "g.csv",
    )

    assert report["rejected"] == [{"column": "a", "count": 1}]


async def test_append_with_different_columns_is_refused_without_writing():
    rows = FakeRows()
    service, imports, oid = await _seeded_import(rows)

    with pytest.raises(SchemaMismatchError) as err:
        await service.ingest(oid, IngestMode.APPEND, upload("a,c\n1,2\n"), "g.csv")

    assert "b" in str(err.value) and "c" in str(err.value)
    assert imports.doc["row_count"] == 1


async def test_append_failure_is_rolled_back():
    rows = FakeRows()
    service, imports, oid = await _seeded_import(rows)
    rows.calls, rows.fail_on_call = 0, 2  # fail on the 2nd chunk of the append

    with pytest.raises(RuntimeError):
        await service.ingest(
            oid,
            IngestMode.APPEND,
            upload("a,b\n1,x\n2,y\n3,z\n"),
            "g.csv",
        )

    assert (
        len(rows.collections[imports.doc["rows_collection"]]) == 1
    )  # only the original row
    assert imports.doc["row_count"] == 1


async def test_zero_one_column_is_boolean_so_other_integers_are_rejected_on_append():
    rows = FakeRows()
    service, imports, oid = make(rows)
    await service.ingest(oid, IngestMode.REPLACE, upload("a\n0\n1\n"), "f.csv")
    assert imports.doc["columns"][0]["type"] == "boolean"

    # Types are frozen on append: 9 cannot be stored in a boolean column.
    report = await service.ingest(oid, IngestMode.APPEND, upload("a\n9\n"), "g.csv")
    assert report["rejected"] == [{"column": "a", "count": 1}]
