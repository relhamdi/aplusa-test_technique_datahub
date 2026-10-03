from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from app.schemas.query import FilterCondition

# Cap the id lists so a request body stays under MongoDB's 16 MB document limit.
MAX_IDS = 100_000


class RowUpdate(BaseModel):
    # Keyed by technical column key. None or blank means "empty value".
    values: dict[str, Any] = Field(min_length=1)


class IdsSelection(BaseModel):
    mode: Literal["ids"]
    ids: list[str] = Field(min_length=1, max_length=MAX_IDS)


class FilterSelection(BaseModel):
    """'Select all' on the filtered result, minus the rows the user unticked."""

    mode: Literal["filter"]
    filters: list[FilterCondition] = Field(default_factory=list, max_length=50)
    excluded_ids: list[str] = Field(default_factory=list, max_length=MAX_IDS)


Selection = Annotated[IdsSelection | FilterSelection, Field(discriminator="mode")]


class FieldAction(BaseModel):
    action: Literal["keep", "set", "clear"]
    value: Any = None  # only used by "set"


class BatchUpdate(BaseModel):
    selection: Selection
    fields: dict[str, FieldAction] = Field(min_length=1)


class BatchDelete(BaseModel):
    selection: Selection


class BatchResult(BaseModel):
    matched: int  # rows selected
    affected: int  # rows actually modified / deleted
