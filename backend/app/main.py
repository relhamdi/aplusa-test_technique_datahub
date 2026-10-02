from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.health import router as health_router
from app.core.config import get_settings
from app.core.database import database
from app.core.indexes import ensure_base_indexes


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    await database.connect(settings)
    await ensure_base_indexes(database.db)
    yield
    await database.close()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Datahub Simplifié", version="0.1.0", lifespan=lifespan)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(health_router)
    return app


app = create_app()
