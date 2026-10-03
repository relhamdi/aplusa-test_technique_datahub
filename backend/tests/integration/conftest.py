import pytest
from httpx import ASGITransport, AsyncClient

from app.core.config import get_settings
from app.core.database import database
from app.core.indexes import ensure_base_indexes
from app.main import app
from app.services.indexing import index_manager


@pytest.fixture
async def client():
    settings = get_settings()
    # Safety guard: teardown drops the whole database.
    assert settings.mongo_db.endswith("_test"), "refusing to run on a non-test DB"

    # ASGITransport does not run the app lifespan, so we connect manually.
    await database.connect(settings)
    await ensure_base_indexes(database.db)
    try:
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as c:
            yield c
    finally:
        await index_manager.wait_idle()
        await database.db.client.drop_database(settings.mongo_db)
        await database.close()
