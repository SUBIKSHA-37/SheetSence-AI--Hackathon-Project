# SheetSense AI

A local-first spreadsheet analyst with a dark React workspace and a FastAPI data service. Upload CSV, XLSX, or JSON files, get a cleaned profile and a live invoice dashboard, then ask questions in plain language. The overview includes dataset-derived totals, status counts, top customers, overdue ranges, monthly comparisons, and a configurable chart builder.

## Run locally

Requirements: Node.js 20+ and Python 3.10+.

1. In `backend`, create an environment and install dependencies: `python -m venv .venv`, then activate it and run `pip install -r requirements.txt`.
2. Start the API from `backend`: `uvicorn main:app --reload --port 8000`.
3. In a second terminal, enter `frontend`, run `npm install`, then `npm run dev`.
4. Open `http://localhost:5173`.

On Windows, after setup, you can start both services with `.\start.ps1`. The script leaves the servers running in the background and skips ports that are already in use.

The API exposes `GET /health`, `POST /upload`, `POST /query`, `GET /dashboard?session_id=...`, `GET /history?session_id=...`, and `POST /chart`. The chart endpoint accepts axis, aggregation, categorical filter, and date-range options. API docs are at `http://localhost:8000/docs`.

Try the included fictional invoice dataset at `examples/invoice-demo.csv` to see the overview, follow-up chat, saved queries, and builder in action.

## What it does

- Reads Excel, CSV, and JSON into a per-process in-memory session (25 MB upload limit).
- Normalizes column names; detects numeric and date fields; fills missing numeric, categorical, and datetime values; and removes duplicate rows.
- Profiles numeric relationships and returns a cleaned preview with row, column, missing-value, and duplicate counts.
- Uses a constrained query planner and pandas operations for common totals, averages, counts, rankings, category breakdowns, and simple value filters. Follow-up questions can refer to the previous metric and grouping.
- Returns chart-ready data with each query. The table, bar, pie, line, scatter, and boxplot views switch without repeating the query.
- Builds invoice metrics from detected columns, records query history for the active session, and offers a drag-and-drop chart builder with sum, average, count, category filters, and date ranges.

## Scope and deployment notes

This starter runs without an LLM provider key. The query planner is deterministic and intentionally does not execute model-generated Python. It is a useful local analysis prototype, not a hosted multi-user service: sessions live in process memory, disappear on restart, and require one API worker. For production deployment, add authenticated persistent sessions, object storage, rate limits, audit controls, and an opt-in model provider behind a strict validated query plan. Treat uploaded files as sensitive; configure retention and deployment access accordingly.
