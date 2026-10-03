import re
from typing import Any

from app.schemas.query import FilterCondition, FilterOp, SortSpec
from app.services.type_conversion import CONVERTERS
from app.services.type_detection import ColumnType


class InvalidQueryError(Exception):
    """Unknown column, unsupported operator or invalid value (HTTP 422)."""


_COMMON = {FilterOp.EQUALS, FilterOp.IS_EMPTY, FilterOp.IS_NOT_EMPTY}
_NUMERIC = _COMMON | {FilterOp.GT, FilterOp.LT, FilterOp.BETWEEN}

# Which operators make sense for which column type.
OPS_BY_TYPE: dict[ColumnType, set[FilterOp]] = {
    ColumnType.STRING: _COMMON | {FilterOp.CONTAINS, FilterOp.STARTS_WITH},
    ColumnType.INTEGER: _NUMERIC,
    ColumnType.FLOAT: _NUMERIC,
    ColumnType.BOOLEAN: _COMMON,
}

# Operators an index can serve.
# CONTAINS is excluded: an unanchored regex scans every key anyway.
INDEXABLE_OPS = set(FilterOp) - {FilterOp.CONTAINS}


def get_column(key: str, columns: dict[str, dict[str, Any]]) -> dict[str, Any]:
    if key not in columns:
        raise InvalidQueryError(f"Unknown column '{key}'")
    return columns[key]


def coerce_value(raw: Any, col_type: ColumnType, column_name: str) -> Any:
    """Convert a JSON value to the column's stored type (same rules as ingestion)."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        raise InvalidQueryError(f"A value is required for column '{column_name}'")
    if col_type is ColumnType.BOOLEAN and isinstance(raw, bool):
        return raw

    if (
        col_type is ColumnType.FLOAT
        and isinstance(raw, int | float)
        and not isinstance(raw, bool)
    ):
        return float(raw)
    try:
        return CONVERTERS[col_type](str(raw))
    except ValueError as exc:
        raise InvalidQueryError(
            f"Invalid {col_type.value} value for column '{column_name}': {raw!r}"
        ) from exc


def _condition(f: FilterCondition, col: dict[str, Any]) -> dict[str, Any]:
    field = f"d.{col['key']}"
    col_type = ColumnType(col["type"])
    if f.op not in OPS_BY_TYPE[col_type]:
        raise InvalidQueryError(
            f"Operator '{f.op}' is not supported on {col_type.value} columns"
        )

    def value() -> Any:
        return coerce_value(f.value, col_type, col["name"])

    match f.op:
        case FilterOp.IS_EMPTY:
            return {field: None}  # matches null AND missing fields
        case FilterOp.IS_NOT_EMPTY:
            return {field: {"$ne": None}}
        case FilterOp.EQUALS:
            return {field: value()}
        case FilterOp.CONTAINS:
            return {field: {"$regex": re.escape(value()), "$options": "i"}}
        case FilterOp.STARTS_WITH:
            return {field: {"$regex": "^" + re.escape(value())}}
        case FilterOp.GT:
            return {field: {"$gt": value()}}
        case FilterOp.LT:
            return {field: {"$lt": value()}}
        case FilterOp.BETWEEN:
            low = value()
            high = coerce_value(f.value_to, col_type, col["name"])
            if low > high:
                raise InvalidQueryError(f"Invalid range for column '{col['name']}'")
            return {field: {"$gte": low, "$lte": high}}
    raise InvalidQueryError(f"Unsupported operator '{f.op}'")  # pragma: no cover


def build_match(
    filters: list[FilterCondition], columns: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Translate filters (ANDed) into a MongoDB query document."""
    conditions = [_condition(f, get_column(f.column, columns)) for f in filters]
    if not conditions:
        return {}
    return conditions[0] if len(conditions) == 1 else {"$and": conditions}


def build_sort(
    sort: SortSpec | None, columns: dict[str, dict[str, Any]]
) -> list[tuple[str, int]]:
    """Sort spec with a deterministic tie-breaker on _id.

    Without a unique tie-breaker, skip/limit pages can overlap or miss rows
    when many values are equal.
    """
    if sort is None:
        return [("_id", 1)]
    col = get_column(sort.column, columns)
    direction = 1 if sort.direction == "asc" else -1
    return [(f"d.{col['key']}", direction), ("_id", direction)]


def index_candidates(
    filters: list[FilterCondition], sort: SortSpec | None
) -> list[str]:
    """Column keys worth indexing for this query, deduplicated, sort column first."""
    keys: list[str] = [sort.column] if sort else []
    keys += [f.column for f in filters if f.op in INDEXABLE_OPS]
    return list(dict.fromkeys(keys))
