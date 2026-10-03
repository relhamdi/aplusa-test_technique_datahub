import pytest
from app.schemas.mutation import FieldAction, FilterSelection, IdsSelection
from app.schemas.query import FilterCondition, FilterOp
from app.services.mutation_builder import (
    build_batch_update,
    build_row_update,
    build_selection_match,
)
from app.services.query_builder import InvalidQueryError
from bson import ObjectId

COLUMNS = {
    "c0": {"key": "c0", "name": "id", "type": "integer"},
    "c1": {"key": "c1", "name": "name", "type": "string"},
    "c2": {"key": "c2", "name": "price", "type": "float"},
    "c3": {"key": "c3", "name": "active", "type": "boolean"},
}


def act(action, value=None):
    return FieldAction(action=action, value=value)


def test_ids_selection():
    a, b = ObjectId(), ObjectId()
    sel = IdsSelection(mode="ids", ids=[str(a), str(b)])
    assert build_selection_match(sel, COLUMNS) == {"_id": {"$in": [a, b]}}


def test_invalid_id_is_rejected():
    with pytest.raises(InvalidQueryError):
        build_selection_match(IdsSelection(mode="ids", ids=["nope"]), COLUMNS)


def test_filter_selection_without_filter_or_exclusion_selects_everything():
    assert build_selection_match(FilterSelection(mode="filter"), COLUMNS) == {}


def test_filter_selection_with_exclusions():
    x = ObjectId()
    flt = FilterCondition(column="c0", op=FilterOp.GT, value=1)
    sel = FilterSelection(mode="filter", filters=[flt], excluded_ids=[str(x)])
    assert build_selection_match(sel, COLUMNS) == {
        "$and": [{"d.c0": {"$gt": 1}}, {"_id": {"$nin": [x]}}]
    }


def test_exclusion_alone_has_no_empty_and():
    x = ObjectId()
    sel = FilterSelection(mode="filter", excluded_ids=[str(x)])
    assert build_selection_match(sel, COLUMNS) == {"_id": {"$nin": [x]}}


def test_batch_update_keep_set_clear():
    update = build_batch_update(
        {
            "c0": act("keep"),
            "c1": act("set", "x"),
            "c2": act("clear"),
            "c3": act("set", "oui"),
        },
        COLUMNS,
    )
    assert update == {"$set": {"d.c1": "x", "d.c2": None, "d.c3": True}}


@pytest.mark.parametrize(
    "fields",
    [
        {"c0": act("keep")},  # nothing to change
        {"c0": act("set")},  # set without a value
        {"c0": act("set", "  ")},  # blank value: use "clear"
        {"c0": act("set", "abc")},  # not an integer
        {"zz": act("set", 1)},  # unknown column
    ],
)
def test_batch_update_invalid(fields):
    with pytest.raises(InvalidQueryError):
        build_batch_update(fields, COLUMNS)


def test_row_update_blank_becomes_null_and_values_are_typed():
    update = build_row_update({"c0": "5", "c1": "  ", "c2": None, "c3": False}, COLUMNS)
    assert update == {"$set": {"d.c0": 5, "d.c1": None, "d.c2": None, "d.c3": False}}


@pytest.mark.parametrize("values", [{}, {"c0": "abc"}, {"zz": 1}, {"c3": "maybe"}])
def test_row_update_invalid(values):
    with pytest.raises(InvalidQueryError):
        build_row_update(values, COLUMNS)
