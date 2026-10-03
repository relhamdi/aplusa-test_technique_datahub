import pandas as pd
import pytest

from app.services.type_detection import (
    ColumnType,
    ColumnTypeAccumulator,
    detect_types,
)


def infer(values: list[str]) -> ColumnType:
    acc = ColumnTypeAccumulator()
    acc.update(values)
    return acc.result()


@pytest.mark.parametrize(
    ("values", "expected"),
    [
        (["true", "False", "TRUE"], ColumnType.BOOLEAN),
        (["oui", "non", "Oui"], ColumnType.BOOLEAN),
        (["0", "1", "1"], ColumnType.BOOLEAN),  # 0/1 only -> boolean
        (["0", "1", "2"], ColumnType.INTEGER),  # a 2 breaks the boolean hypothesis
        (["1", "-5", "+7"], ColumnType.INTEGER),
        (["1", "2.5"], ColumnType.FLOAT),  # int promoted to float
        (["3,5", "2,25"], ColumnType.FLOAT),  # French decimal comma
        (["1.0", "2.0"], ColumnType.FLOAT),  # "1.0" is not an integer
        (["abc", "1"], ColumnType.STRING),
        (["1,000.5"], ColumnType.STRING),  # thousands separators unsupported
        (["inf", "nan1"], ColumnType.STRING),
        (["true", "oui", "1"], ColumnType.BOOLEAN),  # mixing accepted spellings is fine
        (["true", "2"], ColumnType.STRING),
    ],
)
def test_inference(values, expected):
    assert infer(values) == expected


def test_empty_values_are_ignored():
    assert infer(["1", "", "  ", "NaN", "null", "2"]) == ColumnType.INTEGER
    assert infer(["5", "", "7"]) == ColumnType.INTEGER


def test_fully_empty_column_is_string():
    assert infer(["", " ", "null"]) == ColumnType.STRING
    assert infer([]) == ColumnType.STRING


def test_result_is_independent_of_chunk_boundaries():
    # The invalid value arrives in the last chunk: no sampling, so it is caught.
    chunks = [
        pd.DataFrame({"a": ["1", "2"]}),
        pd.DataFrame({"a": ["3", "x"]}),
    ]
    assert detect_types(iter(chunks), ["a"]) == {"a": ColumnType.STRING}
