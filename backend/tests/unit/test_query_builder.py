import pytest

from app.schemas.query import FilterCondition, FilterOp, SortSpec
from app.services.query_builder import (
    InvalidQueryError,
    build_match,
    build_sort,
    index_candidates,
)

COLUMNS = {
    "c0": {"key": "c0", "name": "id", "type": "integer"},
    "c1": {"key": "c1", "name": "name", "type": "string"},
    "c2": {"key": "c2", "name": "price", "type": "float"},
    "c3": {"key": "c3", "name": "active", "type": "boolean"},
}


def f(column, op, value=None, value_to=None):
    return FilterCondition(column=column, op=op, value=value, value_to=value_to)


def test_no_filters_gives_empty_match():
    assert build_match([], COLUMNS) == {}


def test_values_are_coerced_to_the_column_type():
    assert build_match([f("c0", FilterOp.EQUALS, "5")], COLUMNS) == {"d.c0": 5}
    assert build_match([f("c2", FilterOp.GT, "1,5")], COLUMNS) == {"d.c2": {"$gt": 1.5}}
    assert build_match([f("c3", FilterOp.EQUALS, "oui")], COLUMNS) == {"d.c3": True}
    assert build_match([f("c3", FilterOp.EQUALS, False)], COLUMNS) == {"d.c3": False}


def test_contains_escapes_user_input():
    match = build_match([f("c1", FilterOp.CONTAINS, "a.b(")], COLUMNS)
    assert match == {"d.c1": {"$regex": r"a\.b\(", "$options": "i"}}


def test_starts_with_is_anchored():
    match = build_match([f("c1", FilterOp.STARTS_WITH, "ab")], COLUMNS)
    assert match == {"d.c1": {"$regex": "^ab"}}


def test_between_is_inclusive():
    match = build_match([f("c0", FilterOp.BETWEEN, 2, 5)], COLUMNS)
    assert match == {"d.c0": {"$gte": 2, "$lte": 5}}


def test_between_with_reversed_bounds_is_rejected():
    with pytest.raises(InvalidQueryError):
        build_match([f("c0", FilterOp.BETWEEN, 5, 2)], COLUMNS)


def test_empty_operators():
    assert build_match([f("c1", FilterOp.IS_EMPTY)], COLUMNS) == {"d.c1": None}
    assert build_match([f("c1", FilterOp.IS_NOT_EMPTY)], COLUMNS) == {
        "d.c1": {"$ne": None}
    }


def test_several_filters_are_anded():
    match = build_match(
        [f("c0", FilterOp.GT, 1), f("c1", FilterOp.EQUALS, "x")], COLUMNS
    )
    assert match == {"$and": [{"d.c0": {"$gt": 1}}, {"d.c1": "x"}]}


@pytest.mark.parametrize(
    "bad",
    [
        f("zz", FilterOp.EQUALS, 1),  # unknown column
        f("c0", FilterOp.CONTAINS, "1"),  # operator not valid for integer
        f("c3", FilterOp.GT, True),  # operator not valid for boolean
        f("c0", FilterOp.EQUALS, "abc"),  # not an integer
        f("c0", FilterOp.EQUALS, str(2**63)),  # outside int64
        f("c1", FilterOp.CONTAINS, "  "),  # blank value
        f("c0", FilterOp.EQUALS, None),  # missing value
    ],
)
def test_invalid_filters_are_rejected(bad):
    with pytest.raises(InvalidQueryError):
        build_match([bad], COLUMNS)


def test_sort_default_and_tie_breaker_follow_direction():
    assert build_sort(None, COLUMNS) == [("_id", 1)]
    assert build_sort(SortSpec(column="c0"), COLUMNS) == [("d.c0", 1), ("_id", 1)]
    assert build_sort(SortSpec(column="c0", direction="desc"), COLUMNS) == [
        ("d.c0", -1),
        ("_id", -1),
    ]


def test_sort_on_unknown_column_is_rejected():
    with pytest.raises(InvalidQueryError):
        build_sort(SortSpec(column="zz"), COLUMNS)


def test_index_candidates_skip_contains_and_dedupe():
    filters = [
        f("c1", FilterOp.CONTAINS, "x"),
        f("c0", FilterOp.GT, 1),
        f("c0", FilterOp.LT, 9),
    ]
    assert index_candidates(filters, SortSpec(column="c2")) == ["c2", "c0"]
