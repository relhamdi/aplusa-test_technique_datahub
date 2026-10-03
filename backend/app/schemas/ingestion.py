from enum import StrEnum

from pydantic import BaseModel


class IngestMode(StrEnum):
    REPLACE = "replace"
    APPEND = "append"


class RejectedColumn(BaseModel):
    column: str
    count: int


class IngestionReport(BaseModel):
    mode: IngestMode
    filename: str
    rows_inserted: int
    row_count: int
    # Columns with at least one value that could not be converted.
    rejected: list[RejectedColumn]
