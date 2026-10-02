import csv
from pathlib import Path
import pandas as pd

def load_xpsfit_csv_table(csv_path: str | Path) -> tuple[pd.DataFrame, list[str]]:
    """
    Load XPS fit CSV exported with metadata rows and detect the numeric table block.

    Expected table header starts with: abscissa, ordinate, ...
    """
    path = Path(csv_path).expanduser()
    with path.open("r", encoding="utf-8-sig", newline="") as f:
        rows = list(csv.reader(f))

    header_row = None
    for i, row in enumerate(rows):
        c0 = str(row[0]).strip().lower() if len(row) > 0 else ""
        c1 = str(row[1]).strip().lower() if len(row) > 1 else ""
        if c0 == "abscissa" and c1 == "ordinate":
            header_row = i
            break

    if header_row is None:
        raise ValueError("abscissa/ordinate header not found")

    headers = [str(v).strip() for v in rows[header_row]]
    width = len(headers)
    body = rows[header_row + 1 :]
    normalized = []
    for row in body:
        if len(row) < width:
            normalized.append(row + [""] * (width - len(row)))
        else:
            normalized.append(row[:width])
    data = pd.DataFrame(normalized, columns=headers)

    for col in data.columns:
        data[col] = pd.to_numeric(data[col], errors="coerce")

    data = data.dropna(how="all").reset_index(drop=True)
    return data, list(data.columns)
