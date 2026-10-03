from fastapi import APIRouter, HTTPException, status

from app.api.deps import RowQueryServiceDep
from app.schemas.query import PageOut, RowQuery
from app.services.imports import ImportNotFoundError
from app.services.query_builder import InvalidQueryError

router = APIRouter(prefix="/imports", tags=["rows"])


# POST rather than GET: filters are a nested structure, cleaner as a JSON body.
@router.post("/{import_id}/rows/query", response_model=PageOut)
async def query_rows(import_id: str, query: RowQuery, service: RowQueryServiceDep):
    try:
        return await service.query(import_id, query)
    except ImportNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import not found") from exc
    except InvalidQueryError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
