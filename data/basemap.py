"""Build src/data/basemap.json: swisstopo's light base map, trimmed to what the trainer needs.

Run from this directory: `uv run basemap.py`. Re-run when swisstopo updates its style.

Compared to the original style this drops the relief source, every label and pattern layer (so
no fonts or sprites are fetched), inlines the tile URLs (no tiles.json round trip) and limits the
source to the town area, so the map never requests tiles outside town.
"""

import gzip
import json
import urllib.request
from pathlib import Path

STYLE = "https://vectortiles.geo.admin.ch/styles/ch.swisstopo.lightbasemap.vt/style.json"
HERE = Path(__file__).parent
OUT = HERE.parent / "src" / "data" / "basemap.json"
MARGIN = 0.02  # degrees around the town (~1.5 km)
DROP_SOURCE_LAYERS = {"hillshade", "hachure", "contour_line", "scree", "aeroway"}


def get(url: str) -> dict:
    with urllib.request.urlopen(url) as r:
        body = r.read()
    # geo.admin.ch serves gzip even when not asked to
    return json.loads(gzip.decompress(body) if body[:2] == b"\x1f\x8b" else body)


def main() -> None:
    style = get(STYLE)
    base_id, base = next((k, v) for k, v in style["sources"].items() if k.startswith("base"))
    tilejson = get(base["url"])
    town = json.loads((HERE.parent / "src" / "data" / "town.json").read_text())
    w, s, e, n = town["bbox"]
    town_name = json.loads((HERE.parent / "region.json").read_text())["name"]

    layers = [
        layer
        for layer in style["layers"]
        if layer["type"] != "symbol"
        and layer.get("source") in (None, base_id)
        and layer.get("source-layer") not in DROP_SOURCE_LAYERS
        and "pattern" not in json.dumps(layer.get("paint", {}))
    ]
    out = {
        "version": 8,
        "name": f"{town_name} – swisstopo light base map, trimmed",
        "sources": {
            base_id: {
                "type": "vector",
                "tiles": tilejson["tiles"],
                "minzoom": tilejson.get("minzoom", 0),
                "maxzoom": tilejson.get("maxzoom", 14),
                "bounds": [round(w - MARGIN, 4), round(s - MARGIN, 4), round(e + MARGIN, 4), round(n + MARGIN, 4)],
                "attribution": tilejson.get("attribution", "© swisstopo"),
            }
        },
        "layers": layers,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    print(f"{len(layers)} of {len(style['layers'])} layers → {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
