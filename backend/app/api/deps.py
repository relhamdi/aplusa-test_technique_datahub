from typing import Annotated

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.core.config import get_settings
from app.core.database import database
from app.repositories.imports import ImportRepository
from app.repositories.rows import RowRepository
from app.services.imports import ImportService
from app.services.ingestion import IngestionService


def get_db() -> AsyncDatabase:
    return database.db


# Reusable alias
DbDep = Annotated[AsyncDatabase, Depends(get_db)]


def get_import_service(db: DbDep) -> ImportService:
    return ImportService(ImportRepository(db))


def get_ingestion_service(db: DbDep) -> IngestionService:
    return IngestionService(
        ImportRepository(db), RowRepository(db), get_settings().import_chunk_size
    )


# Reusable alias
ImportServiceDep = Annotated[ImportService, Depends(get_import_service)]
IngestionServiceDep = Annotated[IngestionService, Depends(get_ingestion_service)]
