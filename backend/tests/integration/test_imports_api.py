async def test_create_then_list(client):
    r = await client.post("/imports", json={"name": "Sales"})
    assert r.status_code == 201
    assert r.json()["order"] == 0

    r = await client.get("/imports")
    assert [i["name"] for i in r.json()] == ["Sales"]


async def test_patch_and_delete(client):
    created = (await client.post("/imports", json={"name": "A"})).json()

    r = await client.patch(f"/imports/{created['id']}", json={"name": "B"})
    assert r.json()["name"] == "B"

    assert (await client.delete(f"/imports/{created['id']}")).status_code == 204
    assert (await client.get(f"/imports/{created['id']}")).status_code == 404


async def test_reorder(client):
    a = (await client.post("/imports", json={"name": "A"})).json()
    b = (await client.post("/imports", json={"name": "B"})).json()

    r = await client.put("/imports/reorder", json={"ids": [b["id"], a["id"]]})
    assert [i["name"] for i in r.json()] == ["B", "A"]


async def test_reorder_rejects_partial_list(client):
    a = (await client.post("/imports", json={"name": "A"})).json()
    await client.post("/imports", json={"name": "B"})

    r = await client.put("/imports/reorder", json={"ids": [a["id"]]})
    assert r.status_code == 422
