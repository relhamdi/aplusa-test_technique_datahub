from typing import Any

from bson import ObjectId
from bson.errors import InvalidId

from app.schemas.mutation import FieldAction, FilterSelection, IdsSelection
from app.services.query_builder import (
    InvalidQueryError,
    build_match,
    coerce_value,
    get_column,
)
from app.services.type_detection import ColumnType


def _object_ids(values: list[str]) -> list[ObjectId]:
    try:
        return [ObjectId(v) for v in values]
    except (InvalidId, TypeError) as exc:
        raise InvalidQueryError("Invalid row id in selection") from exc


def build_selection_match(
    selection: IdsSelection | FilterSelection, columns: dict[str, dict[str, Any]]
) -> dict[str, Any]:
    """Translate a selection into a MongoDB query.

    Filter mode never materialises ids:
    "select all" on 1M rows stays a single query,
    unticked rows are expressed as a $nin exclusion.
    """
    if isinstance(selection, IdsSelection):
        return {"_id": {"$in": _object_ids(selection.ids)}}

    base = build_match(selection.filters, columns)
    if not selection.excluded_ids:
        return base
    excluded = {"_id": {"$nin": _object_ids(selection.excluded_ids)}}
    return {"$and": [base, excluded]} if base else excluded


def _cell(raw: Any, col: dict[str, Any]) -> Any:
    """Single-row edit: blank means empty (stored as null), else typed value."""
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        return None
    return coerce_value(raw, ColumnType(col["type"]), col["name"])


def build_row_update(
    values: dict[str, Any],
    columns: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    if not values:
        raise InvalidQueryError("No value to update")
    sets = {}
    for key, raw in values.items():
        col = get_column(key, columns)
        sets[f"d.{col['key']}"] = _cell(raw, col)
    return {"$set": sets}


def build_batch_update(
    fields: dict[str, FieldAction],
    columns: dict[str, dict[str, Any]],
) -> dict[str, Any]:
    """keep -> untouched, set -> typed value, clear -> null (the row stays)."""
    sets: dict[str, Any] = {}
    for key, action in fields.items():
        col = get_column(key, columns)
        field = f"d.{col['key']}"
        match action.action:
            case "keep":
                continue
            case "clear":
                sets[field] = None
            case "set":
                # coerce_value rejects a blank value: use "clear" for that.
                sets[field] = coerce_value(
                    action.value, ColumnType(col["type"]), col["name"]
                )
    if not sets:
        raise InvalidQueryError("Nothing to update: every field is set to 'keep'")
    return {"$set": sets}
