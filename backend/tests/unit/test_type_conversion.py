from app.services.type_conversion import convert_column
from app.services.type_detection import ColumnType


def test_boolean_spellings():
    values, rejected = convert_column(
        ["Oui", "non", "1", "0", "TRUE", "false"], ColumnType.BOOLEAN
    )
    assert values == [True, False, True, False, True, False] and rejected == 0


def test_unconvertible_becomes_none_and_is_counted():
    values, rejected = convert_column(["1", "abc", "3"], ColumnType.INTEGER)
    assert values == [1, None, 3] and rejected == 1


def test_empty_is_none_but_not_rejected():
    values, rejected = convert_column(["1", "", " ", "NaN"], ColumnType.INTEGER)
    assert values == [1, None, None, None] and rejected == 0


def test_float_accepts_decimal_comma():
    assert convert_column(["3,5", "2", ".5"], ColumnType.FLOAT)[0] == [3.5, 2.0, 0.5]


def test_integer_out_of_int64_is_rejected():
    values, rejected = convert_column([str(2**63)], ColumnType.INTEGER)
    assert values == [None] and rejected == 1


def test_string_keeps_null_like_text():
    values, _ = convert_column(["null", "x", "  "], ColumnType.STRING)
    assert values == ["null", "x", None]
