import pytest

from app.schemas.query import FilterOp
from app.schemas.stats import ValueFilter, ValueSort
from app.services.query_builder import InvalidQueryError
from app.services.stats_builder import (
    groups_pipeline,
    parse_groups,
    parse_summary,
    summary_pipeline,
)
from app.services.type_detection import ColumnType

BOOL = {"key": "c0", "name": "active", "type": "boolean"}
NUM = {"key": "c1", "name": "price", "type": "float"}
STR = {"key": "c2", "name": "label", "type": "string"}
NON_EMPTY = {"d.c2": {"$ne": None}}


def vf(target, op, value=None, value_to=None):
    return ValueFilter(target=target, op=op, value=value, value_to=value_to)


def facet(pipeline):
    return pipeline[-1]["$facet"]


def test_summary_pipeline_adds_type_specific_accumulators():
    group = summary_pipeline(BOOL, {})[0]["$group"]
    assert "true_count" in group and "false_count" in group and "min" not in group
    group = summary_pipeline(NUM, {})[0]["$group"]
    assert {"min", "max", "avg"} <= group.keys() and "true_count" not in group
    group = summary_pipeline(STR, {})[0]["$group"]
    assert group.keys() == {"_id", "rows", "count"}


def test_summary_pipeline_scopes_with_match_only_when_needed():
    assert "$match" not in summary_pipeline(STR, {})[0]
    assert summary_pipeline(STR, {"d.c1": 1})[0] == {"$match": {"d.c1": 1}}


def test_parse_boolean_summary_excludes_empties_from_percentages():
    out = parse_summary(
        ColumnType.BOOLEAN,
        [{"rows": 10, "count": 8, "true_count": 2, "false_count": 6}],
    )
    assert out["count"] == 8 and out["empty_count"] == 2
    assert out["boolean"] == {
        "true_count": 2,
        "false_count": 6,
        "true_percent": 25.0,
        "false_percent": 75.0,
    }


def test_parse_summary_without_rows_is_all_zero():
    out = parse_summary(ColumnType.BOOLEAN, [])
    assert out["count"] == 0 and out["boolean"]["true_percent"] == 0.0
    assert parse_summary(ColumnType.FLOAT, [])["numeric"] == {
        "min": None,
        "max": None,
        "avg": None,
    }


def test_parse_numeric_summary():
    out = parse_summary(
        ColumnType.INTEGER,
        [{"rows": 3, "count": 3, "min": 1, "max": 9, "avg": 4.0}],
    )
    assert out["numeric"] == {"min": 1, "max": 9, "avg": 4.0} and out["boolean"] is None


def test_default_sort_is_occurrences_desc_with_stable_tie_breaker():
    rows = facet(groups_pipeline(STR, {}, [], ValueSort(), 1, 20))["rows"]
    assert rows[0] == {"$sort": {"count": -1, "_id": 1}}


def test_sort_by_value_and_pagination_bounds():
    rows = facet(
        groups_pipeline(STR, {}, [], ValueSort(target="value", direction="asc"), 3, 50)
    )["rows"]
    assert rows[0] == {"$sort": {"_id": 1}}
    assert rows[1] == {"$skip": 100} and rows[2] == {"$limit": 50}


def test_empty_cells_are_excluded_from_groups():
    pipeline = groups_pipeline(STR, {}, [], ValueSort(), 1, 20)
    assert pipeline[0] == {"$match": NON_EMPTY}
    assert pipeline[1]["$group"]["_id"] == "$d.c2"


def test_scope_is_combined_with_the_non_empty_condition():
    pipeline = groups_pipeline(STR, {"d.c1": {"$gt": 1}}, [], ValueSort(), 1, 20)
    assert pipeline[0] == {"$match": {"$and": [{"d.c1": {"$gt": 1}}, NON_EMPTY]}}


def test_value_filter_is_pushed_before_the_group():
    pipeline = groups_pipeline(
        STR, {}, [vf("value", FilterOp.EQUALS, "a")], ValueSort(), 1, 20
    )
    assert pipeline[0] == {"$match": {"$and": [NON_EMPTY, {"d.c2": "a"}]}}
    assert "$match" not in pipeline[2]  # nothing between $group and $facet


def test_count_filter_stays_after_the_group():
    pipeline = groups_pipeline(
        STR, {}, [vf("count", FilterOp.GT, 1)], ValueSort(), 1, 20
    )
    assert pipeline[2] == {"$match": {"count": {"$gt": 1}}}


def test_count_filter_between():
    pipeline = groups_pipeline(
        STR, {}, [vf("count", FilterOp.BETWEEN, 2, 5)], ValueSort(), 1, 20
    )
    assert pipeline[2] == {"$match": {"count": {"$gte": 2, "$lte": 5}}}


@pytest.mark.parametrize(
    "bad",
    [
        vf("value", FilterOp.IS_EMPTY),  # empties are not in the table
        vf("count", FilterOp.IS_NOT_EMPTY),
        vf("count", FilterOp.CONTAINS, "1"),  # occurrence is an integer
        vf("count", FilterOp.EQUALS, "abc"),
        vf("count", FilterOp.BETWEEN, 5, 2),
        vf("value", FilterOp.GT, "x"),  # not valid on a string column
    ],
)
def test_invalid_value_filters_are_rejected(bad):
    with pytest.raises(InvalidQueryError):
        groups_pipeline(STR, {}, [bad], ValueSort(), 1, 20)


def test_numeric_value_filter_is_typed():
    pipeline = groups_pipeline(
        NUM, {}, [vf("value", FilterOp.GT, "1,5")], ValueSort(), 1, 20
    )
    assert {"d.c1": {"$gt": 1.5}} in pipeline[0]["$match"]["$and"]


def test_parse_groups():
    docs = [
        {
            "rows": [{"value": "a", "count": 3}],
            "meta": [{"groups": 1, "occurrences": 3}],
        }
    ]
    assert parse_groups(docs) == ([{"value": "a", "count": 3}], 1, 3)
    # $facet over zero groups: meta is empty
    assert parse_groups([{"rows": [], "meta": []}]) == ([], 0, 0)
    assert parse_groups([]) == ([], 0, 0)
