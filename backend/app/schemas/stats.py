from typing import Any, Literal

from pydantic import BaseModel, Field

from app.schemas.detection import ColumnTypeName
from app.schemas.query import FilterCondition, FilterOp

Target = Literal["value", "count"]


class ValueFilter(BaseModel):
    """Filter on one column of the value/occurrence table."""

    target: Target
    op: FilterOp
    value: Any = None
    value_to: Any = None


class ValueSort(BaseModel):
    # Default: most frequent values first.
    target: Target = "count"
    direction: Literal["asc", "desc"] = "desc"


class StatsRequest(BaseModel):
    column: str  # technical key ("c0")

    # Restrict the statistics to the rows matching the Data tab filters.
    apply_data_filters: bool = False
    data_filters: list[FilterCondition] = Field(default_factory=list, max_length=50)

    # Value/occurrence table filters.
    value_filters: list[ValueFilter] = Field(default_factory=list, max_length=10)

    # Table filters also restrict the computed global count.
    apply_value_filters: bool = False

    sort: ValueSort = Field(default_factory=ValueSort)
    page: int = Field(default=1, ge=1)
    page_size: Literal[10, 20, 50, 100] = 20


class BooleanSummary(BaseModel):
    true_count: int
    false_count: int
    true_percent: float  # of non-empty values, 2 decimals
    false_percent: float


class NumericSummary(BaseModel):
    min: int | float | None
    max: int | float | None
    avg: float | None


class ValueCount(BaseModel):
    value: Any
    count: int


class ValueCountPage(BaseModel):
    rows: list[ValueCount]
    total: int  # number of distinct values after filters
    page: int
    page_size: int


class StatsOut(BaseModel):
    column: str
    type: ColumnTypeName
    count: int  # non-empty values
    empty_count: int  # empty values, reported separately
    boolean: BooleanSummary | None = None
    numeric: NumericSummary | None = None
    table: ValueCountPage | None = None  # absent for boolean columns
    # Column keys whose index is still being built (the stats run anyway).
    indexing: list[str] = Field(default_factory=list)
