#!/bin/sh
set -e

echo "Running database migrations..."
alembic upgrade head

echo "Seeding database (no-op if already seeded)..."
python seed.py

echo "Starting API server..."
exec uvicorn main:app --host 0.0.0.0 --port 8000
