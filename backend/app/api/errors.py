from collections.abc import Generator
from contextlib import contextmanager

from fastapi import HTTPException, status

from app.services.imports import ImportNotFoundError
from app.services.query_builder import InvalidQueryError
from app.services.row_mutation import RowNotFoundError


@contextmanager
def http_errors() -> Generator[None]:
    """Single place mapping domain errors to HTTP for all row/stats routes."""
    try:
        yield
    except ImportNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Import not found") from exc
    except RowNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Row not found") from exc
    except InvalidQueryError as exc:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, str(exc)) from exc
