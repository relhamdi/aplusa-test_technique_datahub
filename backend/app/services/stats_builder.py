from typing import Any

from app.schemas.query import FilterCondition, FilterOp
from app.schemas.stats import ValueFilter, ValueSort
from app.services.query_builder import InvalidQueryError, build_condition
from app.services.type_detection import ColumnType

# Pseudo-column describing the post-group "count" field,
# occurrence filters go through the same validation as any integer filter.
COUNT_COLUMN = {"key": "count", "name": "occurrence", "type": "integer"}

_EMPTY_OPS = {FilterOp.IS_EMPTY, FilterOp.IS_NOT_EMPTY}


def _and(conditions: list[dict[str, Any]]) -> dict[str, Any]:
    conditions = [c for c in conditions if c]
    if not conditions:
        return {}
    return conditions[0] if len(conditions) == 1 else {"$and": conditions}


def summary_pipeline(
    col: dict[str, Any],
    scope: dict[str, Any],
) -> list[dict[str, Any]]:
    """One $group computing every global statistic in a single pass.

    Only the stats column is read, so when an index exists on it,
    MongoDB can answer from the index alone.
    """
    field = f"$d.{col['key']}"
    group: dict[str, Any] = {
        "_id": None,
        "rows": {"$sum": 1},
        # $gt null is true for any stored value (BSON order: null sorts lowest)
        # and false for null/missing: "is this cell non-empty".
        "count": {"$sum": {"$cond": [{"$gt": [field, None]}, 1, 0]}},
    }
    match ColumnType(col["type"]):
        case ColumnType.BOOLEAN:
            group["true_count"] = {"$sum": {"$cond": [{"$eq": [field, True]}, 1, 0]}}
            group["false_count"] = {"$sum": {"$cond": [{"$eq": [field, False]}, 1, 0]}}
        case ColumnType.INTEGER | ColumnType.FLOAT:
            # $min/$max/$avg ignore nulls natively.
            group["min"] = {"$min": field}
            group["max"] = {"$max": field}
            group["avg"] = {"$avg": field}
    return ([{"$match": scope}] if scope else []) + [{"$group": group}]


def _percent(part: int, total: int) -> float:
    return round(100 * part / total, 2) if total else 0.0


def parse_summary(col_type: ColumnType, docs: list[dict[str, Any]]) -> dict[str, Any]:
    doc = docs[0] if docs else {}  # no document at all: no row in scope
    count = doc.get("count", 0)
    out: dict[str, Any] = {
        "count": count,
        "empty_count": doc.get("rows", 0) - count,
        "boolean": None,
        "numeric": None,
    }
    if col_type is ColumnType.BOOLEAN:
        true_n, false_n = doc.get("true_count", 0), doc.get("false_count", 0)
        out["boolean"] = {
            "true_count": true_n,
            "false_count": false_n,
            # Percentages are over non-empty values, empties are reported apart.
            "true_percent": _percent(true_n, count),
            "false_percent": _percent(false_n, count),
        }
    elif col_type in (ColumnType.INTEGER, ColumnType.FLOAT):
        out["numeric"] = {
            "min": doc.get("min"),
            "max": doc.get("max"),
            "avg": doc.get("avg"),
        }
    return out


def split_value_filters(
    value_filters: list[ValueFilter],
    col: dict[str, Any],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Return (pre-group conditions on the value, post-group conditions on the count).

    Filtering groups by their value is the same as filtering documents by that value,
    so it is pushed BEFORE the $group where an index can serve it.
    Occurrence filters need the group result and must stay after it.
    """
    pre: list[dict[str, Any]] = []
    post: list[dict[str, Any]] = []
    for vf in value_filters:
        if vf.op in _EMPTY_OPS:
            # Empty cells are excluded from the table by construction.
            raise InvalidQueryError("Empty-value operators do not apply to this table")
        target_col = col if vf.target == "value" else COUNT_COLUMN
        cond = FilterCondition(
            column=target_col["key"],
            op=vf.op,
            value=vf.value,
            value_to=vf.value_to,
        )
        if vf.target == "value":
            pre.append(build_condition(cond, target_col))
        else:
            post.append(build_condition(cond, target_col, field="count"))
    return pre, post


def groups_pipeline(
    col: dict[str, Any],
    scope: dict[str, Any],
    value_filters: list[ValueFilter],
    sort: ValueSort,
    page: int,
    page_size: int,
) -> list[dict[str, Any]]:
    """Value/occurrence table: group, filter, then one $facet for page + totals.

    The $facet returns the page and the totals from a single pass over the groups,
    instead of running $group twice.
    """
    field = f"d.{col['key']}"
    pre, post = split_value_filters(value_filters, col)
    non_empty = {field: {"$ne": None}}  # empty cells are not a "value"
    pre_match = _and([scope, non_empty, *pre])

    direction = 1 if sort.direction == "asc" else -1
    # _id (the value) breaks ties so pages never overlap or skip rows.
    sort_stage = (
        {"_id": direction} if sort.target == "value" else {"count": direction, "_id": 1}
    )

    pipeline: list[dict[str, Any]] = [
        {"$match": pre_match},
        {"$group": {"_id": f"${field}", "count": {"$sum": 1}}},
    ]
    if post:
        pipeline.append({"$match": _and(post)})
    pipeline.append(
        {
            "$facet": {
                "rows": [
                    {"$sort": sort_stage},
                    {"$skip": (page - 1) * page_size},
                    {"$limit": page_size},
                    {"$project": {"_id": 0, "value": "$_id", "count": 1}},
                ],
                "meta": [
                    {
                        "$group": {
                            "_id": None,
                            "groups": {"$sum": 1},
                            "occurrences": {"$sum": "$count"},
                        }
                    }
                ],
            }
        }
    )
    return pipeline


def parse_groups(docs: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int, int]:
    """Return (page rows, number of distinct values, total occurrences)."""
    doc = docs[0] if docs else {"rows": [], "meta": []}
    meta = doc["meta"][0] if doc["meta"] else {"groups": 0, "occurrences": 0}
    return doc["rows"], meta["groups"], meta["occurrences"]
