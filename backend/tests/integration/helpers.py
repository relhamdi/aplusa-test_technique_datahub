CSV = b"id,name,price\n1,apple,1.5\n2,banana,2.5\n3,cherry,\n4,apple pie,4.0\n"


async def seed_import(client, csv: bytes = CSV) -> str:
    """Create an import holding CSV. Columns: c0=id (int), c1=name (str), c2=price (float)."""
    import_id = (await client.post("/imports", json={"name": "T"})).json()["id"]
    r = await client.post(
        f"/imports/{import_id}/data",
        data={"mode": "replace"},
        files={"file": ("f.csv", csv, "text/csv")},
    )
    assert r.status_code == 200
    return import_id


async def fetch_rows(client, import_id: str, **body) -> list[dict]:
    r = await client.post(f"/imports/{import_id}/rows/query", json=body)
    return r.json()["rows"]
