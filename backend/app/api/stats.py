from fastapi import APIRouter

from app.api.deps import StatsServiceDep
from app.api.errors import http_errors
from app.schemas.stats import StatsOut, StatsRequest

router = APIRouter(prefix="/imports", tags=["stats"])


@router.post("/{import_id}/stats", response_model=StatsOut)
async def column_stats(import_id: str, payload: StatsRequest, service: StatsServiceDep):
    with http_errors():
        return await service.compute(import_id, payload)
