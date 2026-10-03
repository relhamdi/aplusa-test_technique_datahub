from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

import pandas as pd

from app.services.type_detection import (
    FALSE_VALUES,
    TRUE_VALUES,
    ColumnType,
    is_empty,
    is_float,
    is_integer,
)

# MongoDB integers are 64-bit (larger values would raise at insertion time).
INT64_MIN, INT64_MAX = -(2**63), 2**63 - 1


@dataclass(frozen=True)
class ColumnPlan:
    """How one file column is stored: technical key, display name, target type."""

    key: str
    name: str
    type: ColumnType


def to_boolean(raw: str) -> bool:
    value = raw.strip().lower()
    if value in TRUE_VALUES:
        return True
    if value in FALSE_VALUES:
        return False
    raise ValueError(raw)


def to_integer(raw: str) -> int:
    if not is_integer(raw):
        raise ValueError(raw)
    number = int(raw)
    if not INT64_MIN <= number <= INT64_MAX:
        raise ValueError(raw)
    return number


def to_float(raw: str) -> float:
    if not is_float(raw):
        raise ValueError(raw)
    return float(raw.strip().replace(",", "."))  # French decimal comma


def to_string(raw: str) -> str:
    return raw


CONVERTERS: dict[ColumnType, Callable[[str], Any]] = {
    ColumnType.BOOLEAN: to_boolean,
    ColumnType.INTEGER: to_integer,
    ColumnType.FLOAT: to_float,
    ColumnType.STRING: to_string,
}


def _is_blank(raw: str) -> bool:
    return not raw.strip()


def convert_column(
    values: Iterable[str],
    col_type: ColumnType,
) -> tuple[list[Any], int]:
    """Convert raw strings to typed values; unconvertible values become None.

    Returns (converted values, number of rejected values).
    Empty cells are stored as None but are NOT counted as rejected.
    """
    convert = CONVERTERS[col_type]
    # A string column keeps "null"/"nan" as real text; only blanks are empty.
    is_blank = _is_blank if col_type is ColumnType.STRING else is_empty
    out: list[Any] = []
    rejected = 0
    for raw in values:
        if is_blank(raw):
            out.append(None)
            continue
        try:
            out.append(convert(raw))
        except ValueError:
            out.append(None)
            rejected += 1
    return out, rejected


def convert_chunk(
    chunk: pd.DataFrame,
    plan: list[ColumnPlan],
    ingest_id: str | None,
) -> tuple[list[dict[str, Any]], dict[str, int]]:
    """Turn one all-string DataFrame chunk into Mongo documents.

    Columns are converted one at a time (tight loop per column),
    then zipped into rows: cheaper than converting cell by cell inside a row loop.
    """
    rejected: dict[str, int] = {}
    columns: list[list[Any]] = []
    for col in plan:
        values, count = convert_column(chunk[col.name].tolist(), col.type)
        columns.append(values)
        rejected[col.name] = count

    keys = [col.key for col in plan]
    docs = [
        {"d": dict(zip(keys, row, strict=True))} for row in zip(*columns, strict=True)
    ]
    if ingest_id is not None:
        for doc in docs:
            doc["ingest_id"] = ingest_id
    return docs, rejected
