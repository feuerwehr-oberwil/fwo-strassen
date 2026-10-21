import os

os.environ["DB_PATH"] = ":memory:"

from fastapi.testclient import TestClient  # noqa: E402

import app as server  # noqa: E402

client = TestClient(server.app)
CODE = "rot-schnecke-4821"


def test_save_then_load_roundtrip():
    data = {"cards": {"find:1": {"box": 2, "due": 5, "at": 1}}}
    assert client.put(f"/progress/{CODE}", json=data).status_code == 204
    assert client.get(f"/progress/{CODE}").json() == data


def test_unknown_and_malformed_codes():
    assert client.get("/progress/blau-leiter-0000").status_code == 404
    assert client.get("/progress/DROP-table").status_code == 400


def test_rejects_wrong_shape_and_oversized_bodies():
    assert client.put(f"/progress/{CODE}", json={"nope": 1}).status_code == 400
    big = {"cards": {"x": "y" * 250_000}}
    assert client.put(f"/progress/{CODE}", json=big).status_code == 413


def test_rate_limit_per_ip():
    server._hits.clear()
    codes = [client.get("/progress/gelb-hydrant-1234").status_code for _ in range(server.RATE + 1)]
    assert codes[-1] == 429
    server._hits.clear()
