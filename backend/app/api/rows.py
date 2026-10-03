from collections.abc import Generator
from contextlib import contextmanager

from fastapi import APIRouter, HTTPException, status

from app.api.deps import RowMutationServiceDep, RowQueryServiceDep
from app.schemas.mutation import BatchDelete, BatchResult, BatchUpdate, RowUpdate
from app.schemas.query import PageOut, RowOut, RowQuery
from app.services.imports import ImportNotFoundError
from app.services.query_builder import InvalidQueryError
from app.services.row_mutation import RowNotFoundError

router = APIRouter(prefix="/imports", tags=["rows"])


@contextmanager
def _http_errors() -> Generator[None]:
    """Single place mapping domain errors to HTTP (DRY across all row routes)."""
    try:
        yield
    except ImportNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import not found") from exc
    except RowNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Row not found") from exc
    except InvalidQueryError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


# POST rather than GET: filters are a nested structure, cleaner as a JSON body.
@router.post("/{import_id}/rows/query", response_model=PageOut)
async def query_rows(import_id: str, query: RowQuery, service: RowQueryServiceDep):
    with _http_errors():
        return await service.query(import_id, query)


@router.patch("/{import_id}/rows/{row_id}", response_model=RowOut)
async def update_row(
    import_id: str,
    row_id: str,
    payload: RowUpdate,
    service: RowMutationServiceDep,
):
    with _http_errors():
        return await service.update_row(import_id, row_id, payload)


@router.post("/{import_id}/rows/batch-update", response_model=BatchResult)
async def batch_update(
    import_id: str,
    payload: BatchUpdate,
    service: RowMutationServiceDep,
):
    with _http_errors():
        return await service.batch_update(import_id, payload)


# POST rather than DELETE: request body on DELETE is poorly supported by proxies/clients.
@router.post("/{import_id}/rows/batch-delete", response_model=BatchResult)
async def batch_delete(
    import_id: str,
    payload: BatchDelete,
    service: RowMutationServiceDep,
):
    with _http_errors():
        return await service.batch_delete(import_id, payload)
