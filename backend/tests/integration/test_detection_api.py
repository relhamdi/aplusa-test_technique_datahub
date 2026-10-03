async def test_detect_types_endpoint(client):
    files = {"file": ("data.csv", b"a;b\n1;oui\n2;non\n", "text/csv")}
    r = await client.post("/imports/detect-types", files=files)
    assert r.status_code == 200
    assert r.json() == [
        {"name": "a", "type": "integer"},
        {"name": "b", "type": "boolean"},
    ]


async def test_detect_types_bad_extension(client):
    files = {"file": ("data.pdf", b"x", "application/pdf")}
    r = await client.post("/imports/detect-types", files=files)
    assert r.status_code == 400
