PYTHON ?= python3.11
VENV := .venv/bin
.PHONY: setup dev mock web demo test types demo-check

setup:
	$(PYTHON) -m venv .venv
	$(VENV)/python -m pip install -e './backend[dev]'
	cd web && npm install

dev:
	$(VENV)/uvicorn app.main:app --app-dir backend --host 127.0.0.1 --port 8000 --reload

mock:
	$(VENV)/uvicorn app.mock:app --app-dir backend --host 127.0.0.1 --port 8001 --reload

web:
	cd web && npm run dev

demo:
	cd demo-site && ../$(VENV)/python -m http.server 5500 --bind 127.0.0.1

test:
	$(VENV)/pytest backend/tests
	$(VENV)/ruff check --config backend/pyproject.toml backend scripts

types:
	$(VENV)/python scripts/export_schema.py
	sh scripts/gen_types.sh

demo-check:
	$(VENV)/python scripts/demo_check.py
