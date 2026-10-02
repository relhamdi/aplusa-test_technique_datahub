from fastapi import APIRouter, HTTPException, Response, status

from app.api.deps import ImportServiceDep
from app.schemas.imports import (
    ImportCreate,
    ImportOut,
    ImportUpdate,
    ReorderRequest,
)
from app.services.imports import (
    ImportNotFoundError,
    InvalidReorderError,
)

router = APIRouter(prefix="/imports", tags=["imports"])


def _not_found() -> HTTPException:
    return HTTPException(status.HTTP_404_NOT_FOUND, "Import not found")


@router.get("", response_model=list[ImportOut])
async def list_imports(service: ImportServiceDep):
    return await service.list_imports()


@router.post("", response_model=ImportOut, status_code=status.HTTP_201_CREATED)
async def create_import(
    payload: ImportCreate,
    service: ImportServiceDep,
):
    return await service.create(payload)


# Declared before "/{import_id}" so "reorder" is not captured as an id.
@router.put("/reorder", response_model=list[ImportOut])
async def reorder_imports(
    payload: ReorderRequest,
    service: ImportServiceDep,
):
    try:
        return await service.reorder(payload.ids)
    except (InvalidReorderError, ImportNotFoundError) as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc


@router.get("/{import_id}", response_model=ImportOut)
async def get_import(import_id: str, service: ImportServiceDep):
    try:
        return await service.get(import_id)
    except ImportNotFoundError as exc:
        raise _not_found() from exc


@router.patch("/{import_id}", response_model=ImportOut)
async def update_import(
    import_id: str,
    payload: ImportUpdate,
    service: ImportServiceDep,
):
    try:
        return await service.update(import_id, payload)
    except ImportNotFoundError as exc:
        raise _not_found() from exc


@router.delete("/{import_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_import(import_id: str, service: ImportServiceDep):
    try:
        await service.delete(import_id)
    except ImportNotFoundError as exc:
        raise _not_found() from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)
