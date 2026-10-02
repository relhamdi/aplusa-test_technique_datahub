from typing import Annotated

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.core.database import database
from app.repositories.imports import ImportRepository
from app.services.imports import ImportService


def get_db() -> AsyncDatabase:
    return database.db


# Reusable alias
DbDep = Annotated[AsyncDatabase, Depends(get_db)]


def get_import_service(db: DbDep) -> ImportService:
    return ImportService(ImportRepository(db))


# Reusable alias
ImportServiceDep = Annotated[ImportService, Depends(get_import_service)]
