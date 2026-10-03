import re
from dataclasses import dataclass
from enum import StrEnum


class ColumnType(StrEnum):
    BOOLEAN = "boolean"
    INTEGER = "integer"
    FLOAT = "float"
    STRING = "string"


# Supported spellings for booleans (case-insensitive).
TRUE_VALUES = frozenset({"true", "oui", "1"})
FALSE_VALUES = frozenset({"false", "non", "0"})
BOOLEAN_VALUES = TRUE_VALUES | FALSE_VALUES

# Tokens treated as "empty", in addition to blank strings.
EMPTY_TOKENS = frozenset({"", "nan", "null", "none"})

# Compiled regex (for all the file).
_INT_RE = re.compile(r"[+-]?\d+")
# Accepts "3.5" and "3,5", requires digits, rejects "nan"/"inf" and thousands separators.
_FLOAT_RE = re.compile(r"[+-]?(\d+[.,]\d*|[.,]\d+)")


def is_empty(value: str) -> bool:
    return value.strip().lower() in EMPTY_TOKENS


def is_boolean(value: str) -> bool:
    return value.strip().lower() in BOOLEAN_VALUES


def is_integer(value: str) -> bool:
    return _INT_RE.fullmatch(value.strip()) is not None


def is_float(value: str) -> bool:
    # Integers are valid floats too , a column mixing "1" and "2.5" is a float column.
    v = value.strip()
    return _INT_RE.fullmatch(v) is not None or _FLOAT_RE.fullmatch(v) is not None


@dataclass
class ColumnTypeAccumulator:
    """Streaming type inference for one column.

    Keeps only four flags, so memory stays constant whatever the file size.
    Each flag is a bool, which makes the result independent of chunk boundaries.
    """

    bool_ok: bool = True
    int_ok: bool = True
    float_ok: bool = True
    seen_value: bool = False

    def update(self, values) -> None:
        for raw in values:
            if is_empty(raw):
                continue
            self.seen_value = True
            # Early exit: once everything is ruled out, the column is a string.
            if not (self.bool_ok or self.int_ok or self.float_ok):
                return
            if self.bool_ok and not is_boolean(raw):
                self.bool_ok = False
            if self.int_ok and not is_integer(raw):
                self.int_ok = False
            if self.float_ok and not is_float(raw):
                self.float_ok = False

    def result(self) -> ColumnType:
        if not self.seen_value:
            return ColumnType.STRING  # fully empty column fallback
        if self.bool_ok:
            return ColumnType.BOOLEAN
        if self.int_ok:
            return ColumnType.INTEGER
        if self.float_ok:
            return ColumnType.FLOAT
        return ColumnType.STRING


def detect_types(chunks, columns: list[str]) -> dict[str, ColumnType]:
    """Infer one type per column from an iterator of all-string DataFrame chunks."""
    accumulators = {c: ColumnTypeAccumulator() for c in columns}
    for chunk in chunks:
        for col, acc in accumulators.items():
            acc.update(chunk[col].tolist())
    return {c: acc.result() for c, acc in accumulators.items()}
