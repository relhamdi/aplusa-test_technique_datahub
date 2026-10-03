"""Generate a synthetic CSV/XLSX to try imports and measure performance.

Usage:
    uv run python scripts/generate_csv.py --rows 1000000 --out big.csv
    uv run python scripts/generate_csv.py --rows 1000 --delimiter ";" --decimal-comma --out fr.csv
    uv run python scripts/generate_csv.py --rows 100000 --out sample.xlsx
"""

import argparse
import csv
import random
from datetime import date, timedelta
from pathlib import Path

from openpyxl import Workbook

CATEGORIES = ["books", "games", "music", "toys", "tools", "food", "garden", "sport"]
HEADER = [
    "id",
    "name",
    "price",
    "active",
    "in_stock",
    "quantity",
    "category",
    "created",
    "comment",
]


# Resolved from the script location,
#  output folder is always backend/output whatever the current working directory is.
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "output"


def resolve_output(out: str) -> Path:
    """Bare filenames go to backend/output; explicit paths are kept as given."""
    path = Path(out)
    if path.parent == Path("."):
        OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
        return OUTPUT_DIR / path.name
    path.parent.mkdir(parents=True, exist_ok=True)
    return path


def make_row(i: int, rng: random.Random, decimal_comma: bool) -> list:
    price = f"{rng.uniform(1, 500):.2f}"
    if decimal_comma:
        price = price.replace(".", ",")
    return [
        i,  # integer
        f"item-{rng.randint(1, 50_000)}",  # string, many distinct values
        price,  # float
        rng.choice(["true", "false"]),  # boolean (true/false)
        rng.choice(["oui", "non", ""]),  # boolean with empty values
        rng.choice([str(rng.randint(0, 1000)), ""]),  # integer with empty values
        rng.choice(CATEGORIES),  # string, few distinct values
        (date(2020, 1, 1) + timedelta(days=rng.randint(0, 2000))).isoformat(),
        ""
        if rng.random() < 0.8
        else f"note {rng.randint(1, 100)}",  # mostly empty string
    ]


def write_csv(
    path: str,
    rows: int,
    delimiter: str,
    decimal_comma: bool,
    rng: random.Random,
) -> None:
    # utf-8-sig adds a BOM, like an Excel export: a good test for the reader.
    with open(path, "w", newline="", encoding="utf-8-sig") as f:
        writer = csv.writer(f, delimiter=delimiter)
        writer.writerow(HEADER)
        for i in range(1, rows + 1):
            writer.writerow(make_row(i, rng, decimal_comma))


def write_xlsx(path: str, rows: int, decimal_comma: bool, rng: random.Random) -> None:
    if rows > 1_048_575:
        raise SystemExit("XLSX is limited to 1,048,575 data rows")
    # write_only streams rows to disk instead of keeping the workbook in memory.
    wb = Workbook(write_only=True)
    ws = wb.create_sheet()
    ws.append(HEADER)
    for i in range(1, rows + 1):
        ws.append(make_row(i, rng, decimal_comma))
    wb.save(path)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=100_000)
    parser.add_argument("--out", default="sample.csv")
    parser.add_argument("--delimiter", default=",")
    parser.add_argument("--decimal-comma", action="store_true")
    parser.add_argument("--seed", type=int, default=42)  # reproducible files
    args = parser.parse_args()

    rng = random.Random(args.seed)
    out = resolve_output(args.out)
    if out.suffix.lower() == ".xlsx":
        write_xlsx(str(out), args.rows, args.decimal_comma, rng)
    else:
        write_csv(str(out), args.rows, args.delimiter, args.decimal_comma, rng)
    print(f"Wrote {args.rows} rows to {out}")


if __name__ == "__main__":
    main()
