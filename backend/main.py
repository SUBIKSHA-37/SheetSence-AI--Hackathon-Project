from __future__ import annotations

import io
import re
import uuid
from datetime import date, datetime
from typing import Any

import numpy as np
import pandas as pd
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from services.data_cleaning import clean_dataset

app = FastAPI(title="SheetSense AI", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|10\.\d+\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|192\.168\.\d+\.\d+):517[3-9]",
    allow_origins=["*" ],
    allow_methods=["*"],
    allow_headers=["*"],
)

MAX_FILE_BYTES = 25 * 1024 * 1024
SESSIONS: dict[str, dict[str, Any]] = {}


def json_safe(value: Any) -> Any:
    if value is None or (not isinstance(value, (list, dict)) and pd.isna(value)):
        return None
    if isinstance(value, (pd.Timestamp, datetime, date)):
        return value.isoformat()
    if isinstance(value, np.generic):
        return value.item()
    return value


def number(value: Any) -> str:
    return f"{float(value):,.2f}" if isinstance(value, (int, float, np.number)) else str(value)


class QueryRequest(BaseModel):
    session_id: str
    question: str


class ChartRequest(BaseModel):
    session_id: str
    chart_type: str = "bar"
    x_axis: str | None = None
    y_axis: str | None = None
    aggregation: str = "sum"
    filters: dict[str, Any] = Field(default_factory=dict)
    date_from: str | None = None
    date_to: str | None = None
    question: str | None = None


def choose_column(frame: pd.DataFrame, words: str, kind: str | None = None) -> str | None:
    cols = list(frame.columns)
    lowered = words.lower()
    exact = [c for c in cols if c.replace("_", " ") in lowered or c in lowered]
    if kind == "numeric":
        allowed = set(frame.select_dtypes(include="number").columns)
        exact = [c for c in exact if c in allowed]
        cols = [c for c in cols if c in allowed]
    elif kind == "categorical":
        allowed = set(frame.select_dtypes(exclude=["number", "datetime"]).columns)
        exact = [c for c in exact if c in allowed]
        cols = [c for c in cols if c in allowed]
    if exact:
        return max(exact, key=len)
    words_set = set(re.findall(r"[a-z0-9]+", lowered))
    scored = [(len(words_set & set(c.split("_"))), c) for c in cols]
    best = max(scored, default=(0, None))
    return best[1] if best[0] else (cols[0] if len(cols) == 1 else None)


def plan_query(frame: pd.DataFrame, question: str, previous: dict[str, Any] | None) -> dict[str, Any]:
    q = question.lower().strip()
    nums = list(frame.select_dtypes(include="number").columns)
    cats = list(frame.select_dtypes(exclude=["number", "datetime"]).columns)
    dates = list(frame.select_dtypes(include=["datetime"]).columns)
    if not nums and not cats:
        raise HTTPException(422, "This dataset has no analyzable columns.")

    metric = choose_column(frame, q, "numeric")
    category = choose_column(frame, q, "categorical")
    if any(w in q for w in ("revenue", "sales", "amount", "value", "total", "sum")) and not metric:
        metric = next((c for c in nums if any(w in c for w in ("revenue", "sales", "amount", "value", "total", "price"))), nums[0] if nums else None)
    if not category and any(w in q for w in ("customer", "status", "category", "product", "region", "country", "by ", "per ", "each ")):
        category = next((c for c in cats if any(w in c for w in ("customer", "status", "category", "product", "region", "country"))), cats[0] if cats else None)
    time_group = bool(dates and any(w in q for w in ("month", "monthly", "trend", "over time", "across months")))
    if time_group:
        category = dates[0]
    if not metric and previous and any(w in q for w in ("that", "those", "them", "same", "again", "chart", "plot", "graph")):
        metric, category = previous.get("metric"), category or previous.get("category")
    if not metric and nums:
        metric = next((column for column in nums if any(word in column for word in ("amount", "revenue", "sales", "value", "total", "price"))), nums[0])
    if not category and cats and any(w in q for w in ("by", "per", "group", "compare", "top", "rank", "chart", "plot", "graph", "distribution", "breakdown")):
        category = cats[0]

    operation = "sum"
    if any(w in q for w in ("average", "avg", "mean")): operation = "mean"
    elif any(w in q for w in ("median",)): operation = "median"
    elif any(w in q for w in ("count", "how many", "number of")): operation = "count"
    elif any(w in q for w in ("distribution", "composition", "share")) or ("pie" in q and not any(w in q for w in ("revenue", "amount", "sales", "value"))): operation = "count"
    elif any(w in q for w in ("highest", "maximum", "max")): operation = "max"
    elif any(w in q for w in ("lowest", "minimum", "min")): operation = "min"
    elif any(w in q for w in ("compare", "trend", "over time", "across months", "by month")) and dates: operation = "sum"

    limit_match = re.search(r"\btop\s+(\d+)\b", q)
    limit = min(int(limit_match.group(1)), 100) if limit_match else (10 if "top" in q else 50)
    chart = "pie" if "pie" in q else "line" if any(w in q for w in ("trend", "over time", "line chart", "across months")) else "bar"
    if any(w in q for w in ("chart", "plot", "graph", "visual")):
        wants_chart = True
    else:
        wants_chart = bool(previous and any(w in q for w in ("chart", "plot", "graph")))

    data = frame.copy()
    filter_desc: list[str] = []
    for col in cats:
        vals = data[col].astype(str).drop_duplicates().tolist()
        match = next((v for v in vals if len(v) > 1 and re.search(rf"\b{re.escape(v.lower())}\b", q)), None)
        if match:
            data = data[data[col].astype(str).str.lower() == match.lower()]
            filter_desc.append(f"{col.replace('_', ' ')} is {match}")
    overdue = re.search(r"overdue\s*(?:>|over|greater than)\s*(\d+)", q)
    if overdue:
        col = next((c for c in data.columns if "overdue" in c or "days" in c), None)
        if col and pd.api.types.is_numeric_dtype(data[col]):
            data = data[data[col] > int(overdue.group(1))]
            filter_desc.append(f"{col.replace('_', ' ')} > {overdue.group(1)}")

    if not category and not time_group and any(phrase in q for phrase in ("summarize", "key takeaways", "key insights", "overall overview")):
        numeric_values = frame.select_dtypes(include="number")
        summary_rows = [{"Metric": "Rows analyzed", "Value": len(data)}, {"Metric": "Columns", "Value": len(frame.columns)}]
        if metric and metric in numeric_values:
            summary_rows.extend([
                {"Metric": f"Total {metric.replace('_', ' ')}", "Value": json_safe(data[metric].sum())},
                {"Metric": f"Average {metric.replace('_', ' ')}", "Value": json_safe(data[metric].mean())},
            ])
        common_category = next((col for col in cats if col in data.columns and not re.search(r"(^|_)(id|code|number)$", col)), None)
        if common_category and len(data):
            mode = data[common_category].mode(dropna=True)
            if len(mode): summary_rows.append({"Metric": f"Most common {common_category.replace('_', ' ')}", "Value": json_safe(mode.iloc[0])})
        numeric_rows = [row for row in summary_rows if isinstance(row["Value"], (int, float, np.number))]
        insight = f"Your dataset contains {len(data):,} rows across {len(frame.columns)} fields."
        if metric and metric in numeric_values:
            insight += f" Total {metric.replace('_', ' ')} is {number(data[metric].sum())}, with an average of {number(data[metric].mean())}."
        if common_category and len(data) and len(data[common_category].mode(dropna=True)):
            insight += f" The most common {common_category.replace('_', ' ')} is {data[common_category].mode(dropna=True).iloc[0]}."
        return {"insight": insight, "table": summary_rows, "chart": {"type": "bar", "label": "Metric", "metric": "Value", "data": numeric_rows}, "plan": {"metric": metric, "category": None, "operation": "summary", "filters": filter_desc}, "follow_up": "Ask for a ranking, a breakdown, or a time comparison to explore a specific part of the dataset."}

    if category and metric:
        display_category = "month" if time_group else category
        group_values = data[category].dt.to_period("M").astype(str) if time_group else data[category]
        grouped = data.groupby(group_values, dropna=False)[metric]
        agg = grouped.count() if operation == "count" else getattr(grouped, operation)()
        result = (agg.sort_index() if time_group else agg.sort_values(ascending=False)).head(limit)
        table = [{display_category: json_safe(idx), metric: json_safe(val)} for idx, val in result.items()]
        total = float(data[metric].sum()) if operation == "sum" else None
        insight = f"{len(data):,} rows analyzed. {table[0][display_category]} leads with {number(table[0][metric])} {operation} {metric.replace('_', ' ')}." if table else "No rows matched your filters."
        if total is not None and total > 0 and table:
            share = float(table[0][metric]) / total * 100
            insight += f" That's {share:.1f}% of the total."
        group_label = display_category
    elif metric:
        value = getattr(data[metric], operation)() if operation != "count" else data[metric].count()
        table = [{"Metric": metric.replace("_", " ").title(), operation.title(): json_safe(value)}]
        insight = f"The {operation} {metric.replace('_', ' ')} is {number(value)} across {len(data):,} rows."
        group_label = "Metric"
    else:
        col = category or cats[0]
        vc = data[col].value_counts().head(limit)
        table = [{col: json_safe(idx), "Count": int(val)} for idx, val in vc.items()]
        insight = f"Showing the {len(table)} most common {col.replace('_', ' ')} values across {len(data):,} rows."
        metric, group_label = "Count", col

    if filter_desc:
        insight = f"Filtered to {' and '.join(filter_desc)}. " + insight
    explanation = insight
    return {"insight": explanation, "table": table, "chart": {"type": chart, "label": group_label, "metric": metric or "Count", "data": table}, "plan": {"metric": metric, "category": category, "operation": operation, "filters": filter_desc}, "follow_up": f"{explanation} Try asking for a breakdown, a top list, or a different chart view."}


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/upload")
async def upload(file: UploadFile = File(...)) -> dict[str, Any]:
    name = file.filename or "dataset"
    suffix = name.lower().rsplit(".", 1)[-1] if "." in name else ""
    if suffix not in {"csv", "xlsx", "json"}:
        raise HTTPException(415, "Upload a CSV, XLSX, or JSON file.")
    raw = await file.read(MAX_FILE_BYTES + 1)
    if len(raw) > MAX_FILE_BYTES:
        raise HTTPException(413, "Files must be smaller than 25 MB.")
    try:
        if suffix == "csv": frame = pd.read_csv(io.BytesIO(raw))
        elif suffix == "xlsx": frame = pd.read_excel(io.BytesIO(raw))
        else:
            try: frame = pd.read_json(io.BytesIO(raw))
            except ValueError: frame = pd.read_json(io.BytesIO(raw), orient="records")
    except Exception as exc:
        raise HTTPException(400, f"Could not read this file: {exc}") from exc
    if frame.empty or len(frame.columns) == 0:
        raise HTTPException(400, "The uploaded file has no data rows or columns.")
    frame, summary = clean_dataset(frame)
    if frame.empty or len(frame.columns) == 0:
        raise HTTPException(400, "No usable data remained after cleaning this file.")
    session_id = str(uuid.uuid4())
    SESSIONS[session_id] = {"frame": frame, "previous": None, "messages": []}
    preview = [{k: json_safe(v) for k, v in row.items()} for row in frame.head(8).to_dict(orient="records")]
    profiles: dict[str, Any] = {}
    for column in frame.columns:
        series = frame[column]
        profiles[column] = {"type": summary["column_types"][column], "unique": int(series.nunique(dropna=True))}
        if summary["column_types"][column] == "categorical":
            profiles[column]["values"] = [json_safe(value) for value in series.dropna().astype(str).drop_duplicates().head(60).tolist()]
        if summary["column_types"][column] in {"numeric", "datetime"}:
            profiles[column]["min"] = json_safe(series.min())
            profiles[column]["max"] = json_safe(series.max())
    numeric = frame.select_dtypes(include="number").columns.tolist()
    relationships = []
    if len(numeric) > 1:
        corr = frame[numeric].corr().abs()
        for i, col in enumerate(numeric):
            for other in numeric[i + 1:]:
                val = corr.loc[col, other]
                if pd.notna(val) and val >= 0.6:
                    relationships.append({"columns": [col, other], "correlation": round(float(val), 2)})
    return {"session_id": session_id, "filename": name, "summary": summary, "preview": preview, "profiles": profiles, "relationships": relationships}


@app.post("/query")
def query(request: QueryRequest) -> dict[str, Any]:
    session = SESSIONS.get(request.session_id)
    if not session:
        raise HTTPException(404, "Dataset session expired. Upload the file again to continue.")
    question = request.question.strip()
    if not question or len(question) > 500:
        raise HTTPException(422, "Ask a question between 1 and 500 characters.")
    result = plan_query(session["frame"], question, session["previous"])
    session["previous"] = result["plan"]
    session["messages"].append({"question": question, "result": result})
    return result


def named_column(frame: pd.DataFrame, patterns: tuple[str, ...], *, numeric: bool | None = None) -> str | None:
    candidates = list(frame.columns)
    if numeric is True:
        candidates = frame.select_dtypes(include="number").columns.tolist()
    elif numeric is False:
        candidates = frame.select_dtypes(exclude=["number", "datetime"]).columns.tolist()
    return next((col for pattern in patterns for col in candidates if pattern in col), None)


def table_rows(series: pd.Series, name: str, value_name: str) -> list[dict[str, Any]]:
    return [{name: json_safe(key), value_name: json_safe(value)} for key, value in series.items()]


@app.get("/dashboard")
def dashboard(session_id: str = Query(...)) -> dict[str, Any]:
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(404, "Dataset session expired. Upload the file again to continue.")
    frame = session["frame"]
    amount = named_column(frame, ("amount", "revenue", "sales", "value", "total", "price"), numeric=True)
    if not amount:
        amount = next(iter(frame.select_dtypes(include="number").columns), None)
    status = named_column(frame, ("status", "payment", "state"), numeric=False)
    customer = named_column(frame, ("customer", "client", "account", "company"), numeric=False)
    date_col = next(iter(frame.select_dtypes(include="datetime").columns), None)
    overdue_days = named_column(frame, ("overdue_days", "days_overdue", "days_past_due", "days"), numeric=True)
    paid_mask = pd.Series(False, index=frame.index)
    outstanding_mask = pd.Series(False, index=frame.index)
    if status:
        labels = frame[status].astype(str).str.lower()
        paid_mask = labels.str.contains(r"\bpaid\b", regex=True) & ~labels.str.contains(r"unpaid|not paid", regex=True)
        outstanding_mask = labels.str.contains(r"unpaid|overdue|pending|outstanding|open", regex=True)
    elif overdue_days:
        outstanding_mask = frame[overdue_days].fillna(0) > 0

    totals = {
        "invoiced": float(frame[amount].sum()) if amount else None,
        "paid": float(frame.loc[paid_mask, amount].sum()) if amount and status else None,
        "outstanding": float(frame.loc[outstanding_mask, amount].sum()) if amount and (status or overdue_days) else None,
        "orders": int(len(frame)),
        "average_invoice": float(frame[amount].mean()) if amount else None,
    }
    status_counts = frame[status].astype(str).value_counts().head(12) if status else pd.Series(dtype=int)
    top_customers = frame.groupby(customer, dropna=False)[amount].sum().sort_values(ascending=False).head(10) if customer and amount else pd.Series(dtype=float)
    outstanding_customers = frame.loc[outstanding_mask].groupby(customer, dropna=False)[amount].sum().sort_values(ascending=False).head(10) if customer and amount else pd.Series(dtype=float)
    if overdue_days:
        ranges = pd.cut(frame[overdue_days], [-float("inf"), 0, 30, 60, float("inf")], labels=["Current", "1–30 days", "31–60 days", "61+ days"], include_lowest=True)
        overdue_ranges = ranges.value_counts(sort=False)
    elif status:
        overdue_ranges = frame[status].astype(str).value_counts().head(8)
    else:
        overdue_ranges = pd.Series(dtype=int)
    monthly = pd.Series(dtype=float)
    if date_col and amount:
        monthly = frame.groupby(frame[date_col].dt.to_period("M").astype(str))[amount].sum().sort_index().tail(18)

    return {
        "totals": totals,
        "columns": {"amount": amount, "status": status, "customer": customer, "date": date_col, "overdue_days": overdue_days},
        "status_counts": table_rows(status_counts, status or "status", "count"),
        "top_customers": table_rows(top_customers, customer or "customer", amount or "value"),
        "overdue_ranges": table_rows(overdue_ranges, overdue_days or status or "range", "count"),
        "outstanding_customers": table_rows(outstanding_customers, customer or "customer", amount or "value"),
        "monthly": table_rows(monthly, "month", amount or "value"),
    }


@app.get("/history")
def history(session_id: str = Query(...)) -> dict[str, Any]:
    session = SESSIONS.get(session_id)
    if not session:
        raise HTTPException(404, "Dataset session expired. Upload the file again to continue.")
    return {"items": session["messages"]}


@app.post("/chart")
def chart(request: ChartRequest) -> dict[str, Any]:
    session = SESSIONS.get(request.session_id)
    chart_types = {"bar", "pie", "line", "scatter", "boxplot", "table"}
    if not session:
        raise HTTPException(404, "Dataset session expired. Upload the file again to continue.")
    if request.question and not request.x_axis and not request.y_axis:
        if not session["messages"]:
            raise HTTPException(404, "Run a query before requesting a chart.")
        result = session["messages"][-1]["result"]
        chart_type = next((kind for kind in chart_types if kind in request.question.lower()), result["chart"]["type"])
        return {**result["chart"], "type": chart_type}
    if request.chart_type not in chart_types:
        raise HTTPException(422, f"Chart type must be one of: {', '.join(sorted(chart_types))}.")

    frame = session["frame"].copy()
    dates = frame.select_dtypes(include=["datetime"]).columns.tolist()
    numeric = frame.select_dtypes(include="number").columns.tolist()
    categorical = frame.select_dtypes(exclude=["number", "datetime"]).columns.tolist()
    x_axis = request.x_axis if request.x_axis in frame.columns else (categorical[0] if categorical else dates[0] if dates else None)
    y_axis = request.y_axis if request.y_axis in frame.columns else (numeric[0] if numeric else None)
    if not x_axis:
        raise HTTPException(422, "Choose an X-axis column to build this chart.")
    if request.chart_type != "boxplot" and request.aggregation != "count" and (not y_axis or not pd.api.types.is_numeric_dtype(frame[y_axis])):
        raise HTTPException(422, "Choose a numeric Y-axis column.")
    for column, selected in request.filters.items():
        if column in frame.columns and selected not in (None, "", "All"):
            if isinstance(selected, list):
                frame = frame[frame[column].astype(str).isin([str(value) for value in selected])]
            else:
                frame = frame[frame[column].astype(str) == str(selected)]
    if request.date_from or request.date_to:
        date_column = x_axis if pd.api.types.is_datetime64_any_dtype(frame[x_axis]) else (dates[0] if dates else None)
        if date_column:
            if request.date_from:
                frame = frame[frame[date_column] >= pd.Timestamp(request.date_from)]
            if request.date_to:
                frame = frame[frame[date_column] <= pd.Timestamp(request.date_to) + pd.Timedelta(days=1)]
    if frame.empty:
        return {"type": request.chart_type, "label": x_axis, "metric": y_axis or "count", "data": [], "count": 0}

    if request.chart_type == "boxplot":
        values = frame[y_axis].dropna() if y_axis and y_axis in frame.columns and pd.api.types.is_numeric_dtype(frame[y_axis]) else pd.Series(dtype=float)
        if values.empty:
            raise HTTPException(422, "Boxplot needs a numeric Y-axis column.")
        groups = frame.groupby(x_axis, dropna=False)[y_axis] if x_axis else [(y_axis, values)]
        rows = []
        for name, group in groups:
            stats = group.dropna().quantile([0, .25, .5, .75, 1])
            if len(stats):
                rows.append({x_axis: json_safe(name), "min": float(stats.loc[0]), "q1": float(stats.loc[.25]), "median": float(stats.loc[.5]), "q3": float(stats.loc[.75]), "max": float(stats.loc[1])})
        return {"type": "boxplot", "label": x_axis, "metric": y_axis, "data": rows, "count": int(len(values))}

    if request.aggregation not in {"sum", "mean", "count"}:
        raise HTTPException(422, "Aggregation must be sum, mean, or count.")
    key_values = frame[x_axis]
    if pd.api.types.is_datetime64_any_dtype(frame[x_axis]):
        key_values = frame[x_axis].dt.to_period("M").astype(str)
    grouped = frame.groupby(key_values, dropna=False)
    if request.aggregation == "count":
        values = grouped.size()
    else:
        values = getattr(grouped[y_axis], request.aggregation)()
    rows = [{x_axis: json_safe(key), y_axis or "count": json_safe(value)} for key, value in values.items()]
    if request.chart_type == "pie":
        rows = sorted(rows, key=lambda row: row[y_axis or "count"], reverse=True)[:12]
    return {"type": request.chart_type, "label": x_axis, "metric": y_axis or "count", "data": rows, "count": len(rows)}
