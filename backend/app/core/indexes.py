from pymongo.asynchronous.database import AsyncDatabase


async def ensure_base_indexes(db: AsyncDatabase) -> None:
    """Indexes created at startup (different from column indexes).

    Column indexes for row collections will be created on demand.
    """
    # List on the home page, sorted manually.
    await db["imports"].create_index([("order", 1)], name="idx_imports_order")
