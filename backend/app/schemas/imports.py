from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ImportCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=1000)


class ImportUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)


class ColumnOut(BaseModel):
    key: str
    name: str
    type: str


class ImportOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str
    description: str
    order: int
    columns: list[ColumnOut]
    row_count: int
    created_at: datetime
    updated_at: datetime


class ReorderRequest(BaseModel):
    # Full ordered list of ids
    ids: list[str] = Field(min_length=1)
