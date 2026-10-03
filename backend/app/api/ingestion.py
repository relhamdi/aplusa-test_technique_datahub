from typing import Annotated

from fastapi import APIRouter, Form, HTTPException, UploadFile, status
from pydantic import TypeAdapter, ValidationError

from app.api.deps import IngestionServiceDep
from app.core.config import get_settings
from app.schemas.detection import DetectedColumn
from app.schemas.ingestion import IngestionReport, IngestMode
from app.services.file_reader import FileReadError
from app.services.imports import ImportNotFoundError
from app.services.ingestion import IngestionError, SchemaMismatchError

router = APIRouter(prefix="/imports", tags=["ingestion"])

_types_adapter = TypeAdapter(list[DetectedColumn])


def _parse_types(raw: str | None) -> list[DetectedColumn] | None:
    # `types` travels as a JSON string because the request is multipart.
    if not raw:
        return None
    try:
        return _types_adapter.validate_json(raw)
    except ValidationError as exc:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT, "Invalid 'types' field"
        ) from exc


@router.post("/{import_id}/data", response_model=IngestionReport)
async def ingest_file(
    import_id: str,
    service: IngestionServiceDep,
    file: UploadFile,
    mode: Annotated[IngestMode, Form()],
    types: Annotated[str | None, Form()] = None,
):
    max_bytes = get_settings().max_upload_mb * 1024 * 1024
    if file.size is not None and file.size > max_bytes:
        raise HTTPException(413, "File too large")
    try:
        return await service.ingest(
            import_id, mode, file.file, file.filename or "", _parse_types(types)
        )
    except ImportNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import not found") from exc
    except SchemaMismatchError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, str(exc)) from exc
    except (IngestionError, FileReadError) as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
