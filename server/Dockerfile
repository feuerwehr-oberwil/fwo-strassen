FROM python:3.12-slim
COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev
COPY app.py ./
# progress.db lives on a Railway volume mounted at /data
ENV DB_PATH=/data/progress.db
CMD ["sh", "-c", "uv run --no-dev uvicorn app:app --host 0.0.0.0 --port ${PORT:-8000}"]
