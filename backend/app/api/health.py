from fastapi import APIRouter

from app.core.database import database

router = APIRouter(tags=["health"])


@router.get("/health")
async def health() -> dict[str, str]:
    await database.db.command("ping")
    return {"status": "ok", "mongo": "ok"}
