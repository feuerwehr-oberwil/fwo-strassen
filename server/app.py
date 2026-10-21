"""Progress backup for the Strassen-Trainer.

The app keeps progress in the browser and mirrors it here under an anonymous code like
"rot-schnecke-4821", so it survives Safari's storage eviction and moves to a new phone.
No accounts, no personal data: a code and an opaque JSON blob of quiz cards.

Run locally: `uv run uvicorn app:app --reload`. Env: DB_PATH, ALLOWED_ORIGINS (comma-separated).
"""

import json
import os
import re
import sqlite3
import time
from collections import defaultdict, deque
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware

CODE = re.compile(r"^[a-z]{2,12}-[a-z]{2,12}-\d{4}$")
MAX_BYTES = 200_000  # a full set of cards is ~30 KB
RATE = 120  # requests per minute and client IP

DB_PATH = Path(os.environ.get("DB_PATH", "progress.db"))
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
db = sqlite3.connect(DB_PATH, check_same_thread=False)
db.execute("create table if not exists progress (code text primary key, data text not null, updated_at real not null)")

app = FastAPI(title="Strassen-Trainer progress backup")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o],
    allow_methods=["GET", "PUT"],
    allow_headers=["Content-Type"],
)

_hits: dict[str, deque[float]] = defaultdict(deque)


def _limit(request: Request) -> None:
    """Sliding-window rate limit per client IP; guessing codes should be slow."""
    ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "?").split(",")[0]
    now = time.monotonic()
    hits = _hits[ip]
    while hits and now - hits[0] > 60:
        hits.popleft()
    if len(hits) >= RATE:
        raise HTTPException(429, "Zu viele Anfragen")
    hits.append(now)


def _check(code: str) -> None:
    if not CODE.match(code):
        raise HTTPException(400, "Ungültiger Code")


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/progress/{code}")
def load(code: str, request: Request) -> Response:
    _limit(request)
    _check(code)
    row = db.execute("select data from progress where code = ?", (code,)).fetchone()
    if not row:
        raise HTTPException(404, "Unbekannter Code")
    return Response(row[0], media_type="application/json")


@app.put("/progress/{code}", status_code=204)
async def save(code: str, request: Request) -> None:
    _limit(request)
    _check(code)
    body = await request.body()
    if len(body) > MAX_BYTES:
        raise HTTPException(413, "Zu gross")
    try:
        data = json.loads(body)
    except ValueError:
        raise HTTPException(400, "Kein JSON") from None
    if not isinstance(data, dict) or not isinstance(data.get("cards"), dict):
        raise HTTPException(400, "Erwartet {cards: {...}}")
    db.execute(
        "insert into progress (code, data, updated_at) values (?, ?, ?) "
        "on conflict(code) do update set data = excluded.data, updated_at = excluded.updated_at",
        (code, json.dumps(data, separators=(",", ":")), time.time()),
    )
    db.commit()
