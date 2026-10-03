from pymongo import AsyncMongoClient
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import Settings


class Database:
    """Manage Mongo client lifecycle."""

    def __init__(self) -> None:
        self._client: AsyncMongoClient | None = None
        self._db: AsyncDatabase | None = None

    async def connect(self, settings: Settings) -> None:
        self._client = AsyncMongoClient(settings.mongo_uri, tz_aware=True)
        self._db = self._client[settings.mongo_db]
        await self._client.admin.command("ping")

    async def close(self) -> None:
        if self._client is not None:
            await self._client.close()

    @property
    def db(self) -> AsyncDatabase:
        if self._db is None:
            raise RuntimeError("Database not connected")
        return self._db


database = Database()
