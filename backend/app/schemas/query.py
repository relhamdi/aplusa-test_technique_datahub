from enum import StrEnum
from typing import Any, Literal

from pydantic import BaseModel, Field


class FilterOp(StrEnum):
    EQUALS = "equals"
    CONTAINS = "contains"
    STARTS_WITH = "starts_with"
    GT = "gt"
    LT = "lt"
    BETWEEN = "between"
    IS_EMPTY = "is_empty"
    IS_NOT_EMPTY = "is_not_empty"


class FilterCondition(BaseModel):
    # `column` is the technical key ("c0"), not the display name.
    column: str
    op: FilterOp
    value: Any = None
    value_to: Any = None  # upper bound, only used by BETWEEN


class SortSpec(BaseModel):
    column: str
    direction: Literal["asc", "desc"] = "asc"


class RowQuery(BaseModel):
    # Filters are combined with AND.
    filters: list[FilterCondition] = Field(default_factory=list, max_length=50)
    sort: SortSpec | None = None
    page: int = Field(default=1, ge=1)
    # Sizes above 10 000 (up to 1M/10M) will go through a dedicated streaming endpoint,
    # this endpoint stays a plain JSON response.
    page_size: Literal[10, 20, 50, 100, 1000, 5000, 10000] = 20


class StreamQuery(RowQuery):
    # Same filters/sort/page as the paginated endpoint,
    # but huge sizes (1M, 10M) are allowed because the response is streamed.
    page_size: Literal[10, 20, 50, 100, 1000, 5000, 10000, 1_000_000, 10_000_000] = 20


class RowOut(BaseModel):
    id: str
    values: dict[str, Any]  # keyed by technical column key


class PageOut(BaseModel):
    rows: list[RowOut]
    total: int
    page: int
    page_size: int
    # Column keys whose index is still being built (the query runs anyway).
    indexing: list[str]
