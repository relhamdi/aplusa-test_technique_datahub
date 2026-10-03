from fastapi import APIRouter, HTTPException, UploadFile, status

from app.core.config import get_settings
from app.schemas.detection import DetectedColumn
from app.services.detection import detect_file_types
from app.services.file_reader import FileReadError

router = APIRouter(prefix="/imports", tags=["imports"])


# Stateless: nothing is stored (file re-uploaded at ingestion time)
@router.post("/detect-types", response_model=list[DetectedColumn])
def detect_types_endpoint(file: UploadFile):
    try:
        return detect_file_types(
            file.file,
            file.filename or "",
            get_settings().import_chunk_size,
        )
    except FileReadError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(exc)) from exc
