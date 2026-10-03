from typing import BinaryIO

import pandas as pd

from app.services.file_reader import FileReadError, read_chunks
from app.services.type_detection import detect_types


def validate_header(header: list[str]) -> None:
    """Reject headers we cannot map to columns unambiguously."""
    cleaned = [h.strip() for h in header]
    if any(not h for h in cleaned):
        raise FileReadError("The header contains an empty column name")
    if len(set(cleaned)) != len(cleaned):
        raise FileReadError("The header contains duplicate column names")


def detect_file_types(stream: BinaryIO, filename: str, chunk_size: int) -> list[dict]:
    header, chunks = read_chunks(stream, filename, chunk_size)
    validate_header(header)
    try:
        types = detect_types(chunks, header)
    except (pd.errors.ParserError, UnicodeDecodeError) as exc:
        # Case of parsing errors surfacing mid-file, while iterating chunks.
        raise FileReadError(f"Cannot parse file: {exc}") from exc
    return [{"name": name, "type": types[name].value} for name in header]
