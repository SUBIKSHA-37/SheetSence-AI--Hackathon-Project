from __future__ import annotations

import re
from typing import Any, Tuple

import pandas as pd


def _clean_column(name: Any) -> str:
    value = re.sub(r"[^a-zA-Z0-9]+", "_", str(name).strip().lower()).strip("_")
    return value or "column"


def _column_type(series: pd.Series) -> str:
    if pd.api.types.is_datetime64_any_dtype(series):
        return "datetime"
    if pd.api.types.is_numeric_dtype(series):
        return "numeric"
    return "categorical"


def clean_dataset(df: pd.DataFrame) -> Tuple[pd.DataFrame, dict]:
    """Normalize and profile a dataset before it is stored for analysis."""
    frame = df.copy()
    original_rows, original_columns = frame.shape

    names: list[str] = []
    seen: dict[str, int] = {}
    for column in frame.columns:
        base = _clean_column(column)
        seen[base] = seen.get(base, 0) + 1
        names.append(base if seen[base] == 1 else f"{base}_{seen[base]}")
    frame.columns = names
    columns_cleaned = sum(str(old) != new for old, new in zip(df.columns, names))

    # Normalize text before profiling so whitespace-only and corrupted cells count as missing.
    for column in frame.columns:
        if pd.api.types.is_object_dtype(frame[column]) or pd.api.types.is_string_dtype(frame[column]):
            values = frame[column].astype("string").str.replace("\x00", "", regex=False).str.strip()
            invalid = values.str.contains("\ufffd", regex=False, na=False) | (
                values.notna() & ~values.str.contains(r"[A-Za-z0-9]", regex=True, na=False)
            )
            frame[column] = values.mask(values.eq("") | invalid, pd.NA)

    # Discard records that contain no useful values after text normalization.
    all_empty = frame.isna().all(axis=1)
    invalid_rows_removed = int(all_empty.sum())
    frame = frame.loc[~all_empty].copy()
    duplicates_removed = int(frame.duplicated().sum())
    frame = frame.drop_duplicates().reset_index(drop=True)

    date_columns: list[str] = []
    for column in frame.columns:
        series = frame[column]
        if pd.api.types.is_object_dtype(series) or pd.api.types.is_string_dtype(series):
            text = series.astype("string").str.strip()
            nonempty = text.dropna()
            if len(nonempty):
                numeric_text = text.str.replace(r"[$,£€%]", "", regex=True)
                numeric = pd.to_numeric(numeric_text, errors="coerce")
                numeric_ratio = numeric.notna().sum() / len(nonempty)
                numeric_name = re.search(r"amount|revenue|sales|value|price|cost|quantity|qty|count|total", column)
                if numeric_ratio >= (0.5 if numeric_name else 0.88):
                    frame[column] = numeric
                    continue
                if re.search(r"date|time|created|updated|due|month", column, re.IGNORECASE):
                    parsed = pd.to_datetime(text, errors="coerce")
                    if parsed.notna().sum() / len(nonempty) >= 0.5:
                        frame[column] = parsed
                        date_columns.append(column)
                        continue
            frame[column] = text.astype("string")
        if pd.api.types.is_datetime64_any_dtype(frame[column]):
            date_columns.append(column)

    date_columns = sorted(set(date_columns))
    missing_values_fixed = 0
    invalid_date_rows = pd.Series(False, index=frame.index)
    for column in frame.columns:
        missing = frame[column].isna()
        count = int(missing.sum())
        if not count:
            continue
        if pd.api.types.is_numeric_dtype(frame[column]):
            median = frame[column].median()
            frame[column] = frame[column].fillna(0 if pd.isna(median) else median)
            missing_values_fixed += count
        elif pd.api.types.is_datetime64_any_dtype(frame[column]):
            frame[column] = frame[column].ffill().bfill()
            remaining = frame[column].isna()
            invalid_date_rows |= remaining
            missing_values_fixed += count - int(remaining.sum())
        else:
            frame[column] = frame[column].fillna("Unknown")
            missing_values_fixed += count

    invalid_date_count = int(invalid_date_rows.sum())
    if invalid_date_count:
        frame = frame.loc[~invalid_date_rows].reset_index(drop=True)
        invalid_rows_removed += invalid_date_count

    outliers_detected = 0
    for column in frame.select_dtypes(include="number").columns:
        # Detect only; capping is intentionally opt-in to avoid silently changing valid extremes.
        values = frame[column].dropna()
        if len(values) < 4:
            continue
        q1, q3 = values.quantile([0.25, 0.75])
        spread = q3 - q1
        if spread > 0:
            outliers_detected += int(((frame[column] < q1 - 1.5 * spread) | (frame[column] > q3 + 1.5 * spread)).sum())

    data_types_detected = {column: _column_type(frame[column]) for column in frame.columns}
    summary = {
        "total_rows": len(frame),
        "total_columns": len(frame.columns),
        "missing_values_fixed": missing_values_fixed,
        "duplicates_removed": duplicates_removed,
        "columns_cleaned": columns_cleaned,
        "data_types_detected": data_types_detected,
        "original_rows": original_rows,
        "original_columns": original_columns,
        "invalid_rows_removed": invalid_rows_removed,
        "outliers_detected": outliers_detected,
        "outliers_capped": 0,
        # Backward-compatible aliases used by existing dashboard/query consumers.
        "rows": len(frame),
        "columns": len(frame.columns),
        "missing_filled": missing_values_fixed,
        "removed_duplicates": duplicates_removed,
        "date_columns": date_columns,
        "column_types": data_types_detected,
    }
    return frame, summary
