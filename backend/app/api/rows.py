from fastapi import APIRouter

from app.api.deps import RowMutationServiceDep, RowQueryServiceDep
from app.api.errors import http_errors
from app.schemas.mutation import BatchDelete, BatchResult, BatchUpdate, RowUpdate
from app.schemas.query import PageOut, RowOut, RowQuery

router = APIRouter(prefix="/imports", tags=["rows"])


# POST rather than GET: filters are a nested structure, cleaner as a JSON body.
@router.post("/{import_id}/rows/query", response_model=PageOut)
async def query_rows(import_id: str, query: RowQuery, service: RowQueryServiceDep):
    with http_errors():
        return await service.query(import_id, query)


@router.patch("/{import_id}/rows/{row_id}", response_model=RowOut)
async def update_row(
    import_id: str,
    row_id: str,
    payload: RowUpdate,
    service: RowMutationServiceDep,
):
    with http_errors():
        return await service.update_row(import_id, row_id, payload)


@router.post("/{import_id}/rows/batch-update", response_model=BatchResult)
async def batch_update(
    import_id: str,
    payload: BatchUpdate,
    service: RowMutationServiceDep,
):
    with http_errors():
        return await service.batch_update(import_id, payload)


# POST rather than DELETE: request body on DELETE is poorly supported by proxies/clients.
@router.post("/{import_id}/rows/batch-delete", response_model=BatchResult)
async def batch_delete(
    import_id: str,
    payload: BatchDelete,
    service: RowMutationServiceDep,
):
    with http_errors():
        return await service.batch_delete(import_id, payload)
