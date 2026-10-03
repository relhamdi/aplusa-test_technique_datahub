import io

import pytest
from openpyxl import Workbook

from app.services.detection import detect_file_types
from app.services.file_reader import FileReadError


def run(content: bytes, name: str = "f.csv"):
    return detect_file_types(io.BytesIO(content), name, chunk_size=2)


def test_comma_csv():
    out = run(b"a,b,c\n1,x,true\n2,y,false\n3,z,\n")
    assert [c["type"] for c in out] == ["integer", "string", "boolean"]


def test_semicolon_csv_with_decimal_comma():
    out = run(b"prix;nom\n1,5;a\n2,25;b\n")
    assert [c["type"] for c in out] == ["float", "string"]


def test_latin1_encoding():
    out = run("ville;n\nGen\xe8ve;1\nZ\xfcrich;2\n".encode("latin-1"))
    assert [c["name"] for c in out] == ["ville", "n"]


def test_utf8_bom_is_stripped():
    out = run(b"\xef\xbb\xbfa,b\n1,2\n")
    assert out[0]["name"] == "a"


def test_invalid_value_in_late_chunk_is_detected():
    # chunk_size=2: the bad value sits in the 2nd chunk.
    out = run(b"a\n1\n2\n3\nx\n")
    assert out[0]["type"] == "string"


def test_header_only_file_is_rejected():
    with pytest.raises(FileReadError):
        run(b"a,b\n")


def test_header_only_xlsx_is_rejected(tmp_path):
    wb = Workbook()
    wb.active.append(["a", "b"])
    path = tmp_path / "h.xlsx"
    wb.save(path)
    with pytest.raises(FileReadError), path.open("rb") as f:
        detect_file_types(f, "h.xlsx", chunk_size=10)


def test_unsupported_extension():
    with pytest.raises(FileReadError):
        run(b"whatever", "f.pdf")


def test_duplicate_header_in_xlsx_is_rejected(tmp_path):
    wb = Workbook()
    wb.active.append(["a", "a"])
    wb.active.append([1, 2])
    path = tmp_path / "d.xlsx"
    wb.save(path)
    with pytest.raises(FileReadError), path.open("rb") as f:
        detect_file_types(f, "d.xlsx", chunk_size=10)
