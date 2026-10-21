"""Build public/oberwil.json from swisstopo open data.

Run from this directory: `uv run build.py`. Downloads are cached in ./cache.

Sources (both © swisstopo, free use with attribution):
- Amtliches Strassenverzeichnis: street names and line geometry (GDB layer PURE_LIN),
  named areas as polygons (PURE_PLY).
- Amtliches Gebäudeadressverzeichnis: every building address with coordinates; used to
  split long streets into house-number sections.
"""

import json
import math
import re
import urllib.request
import zipfile
from pathlib import Path

import geopandas as gpd
import pandas as pd
from pyproj import Transformer
from shapely.geometry import LineString, MultiLineString, Point, mapping
from shapely.geometry.base import BaseGeometry
from shapely.ops import substring

BFS_NR = 2771  # Oberwil (BL)
LONG_STREET_M = 500  # streets longer than this get house-number sections
STATION = ("Löchlimattstrasse", "1")  # Feuerwehrmagazin, the only marker on the map
HERE = Path(__file__).parent
CACHE = HERE / "cache"
OUT = HERE.parent / "public" / "oberwil.json"

STREETS = "https://data.geo.admin.ch/ch.swisstopo.amtliches-strassenverzeichnis/amtliches-strassenverzeichnis_ch/amtliches-strassenverzeichnis_ch_2056"
ADDRESSES = "https://data.geo.admin.ch/ch.swisstopo.amtliches-gebaeudeadressverzeichnis/amtliches-gebaeudeadressverzeichnis_ch/amtliches-gebaeudeadressverzeichnis_ch_2056"

to_wgs84 = Transformer.from_crs(2056, 4326, always_xy=True)


def fetch(url: str) -> Path:
    """Download and unzip `url` into the cache once; returns the extracted path."""
    CACHE.mkdir(exist_ok=True)
    zip_path = CACHE / url.rsplit("/", 1)[1]
    target = CACHE / zip_path.name.removesuffix(".zip")
    if not target.exists():
        print(f"downloading {zip_path.name} …")
        urllib.request.urlretrieve(url, zip_path)
        with zipfile.ZipFile(zip_path) as z:
            for info in z.infolist():
                # the GDB archive uses backslashes as separators
                info.filename = info.filename.replace("\\", "/")
                z.extract(info, CACHE)
        zip_path.unlink()
    return target


def house_number(label: str) -> int | None:
    """'12a' -> 12, '31.1' -> 31, '' -> None."""
    m = re.match(r"\d+", str(label))
    return int(m.group()) if m else None


def number_ranges(numbers: list[int], k: int) -> list[tuple[int, int]]:
    """Split sorted house numbers into at most k contiguous ranges with round borders.

    Borders sit at address-count quantiles, rounded to a multiple of 10 (5 for short
    streets) so drivers can remember them. Ranges without any address are dropped.
    """
    nums = sorted(numbers)
    step = 10 if nums[-1] >= 60 else 5
    borders: list[int] = []
    for i in range(1, k):
        b = round(nums[i * len(nums) // k] / step) * step
        if b > nums[0] and b <= nums[-1] and (not borders or b > borders[-1]):
            borders.append(b)
    lows = [nums[0], *borders]
    highs = [b - 1 for b in borders] + [nums[-1]]
    ranges = [(lo, hi) for lo, hi in zip(lows, highs) if any(lo <= n <= hi for n in nums)]
    return ranges


def section_count(length_m: float, n_addresses: int) -> int:
    """How many house-number sections a long street gets (0 means: none).

    Roughly one per 500 m, at most 5, and at least ~15 addresses per section, so a
    section is worth remembering. Streets with fewer than 12 addresses get none.
    """
    if n_addresses < 12:
        return 0
    return max(2, min(5, round(length_m / 500), n_addresses // 15))


def parts(geom: BaseGeometry) -> list[LineString]:
    return list(geom.geoms) if isinstance(geom, MultiLineString) else [geom]


def section_geometries(street: BaseGeometry, points: list[list[Point]]) -> list[MultiLineString]:
    """Cut a street line into one piece per address group (groups ordered by number).

    Each address is projected onto its nearest line part. Per part, a group covers the
    stretch from its first to last address (outliers trimmed); neighbouring groups meet
    halfway so the sections touch.
    """
    lines = parts(street)
    spans: dict[int, list[tuple[int, float, float]]] = {}  # part -> (group, start, end)
    for g, pts in enumerate(points):
        by_part: dict[int, list[float]] = {}
        for p in pts:
            i = min(range(len(lines)), key=lambda j: lines[j].distance(p))
            by_part.setdefault(i, []).append(lines[i].project(p))
        for i, ms in by_part.items():
            ms.sort()
            trim = len(ms) // 10  # ignore the outer 10 % on each side
            ms = ms[trim : len(ms) - trim] or ms
            spans.setdefault(i, []).append((g, ms[0], ms[-1]))
    pieces: list[list[LineString]] = [[] for _ in points]
    for i, sp in spans.items():
        sp.sort(key=lambda s: (s[1] + s[2]) / 2)
        line = lines[i]
        for j, (g, a, b) in enumerate(sp):
            start = (sp[j - 1][2] + a) / 2 if j > 0 else max(0.0, a - 25)
            end = (b + sp[j + 1][1]) / 2 if j < len(sp) - 1 else min(line.length, b + 25)
            if end - start > 5:
                pieces[g].append(substring(line, start, end))
    return [MultiLineString(p) for p in pieces]


def cross_streets(section: MultiLineString, own_id: int, lines: gpd.GeoSeries, names: dict[int, str]) -> list[str]:
    """Other streets meeting this section, in order along its longest piece."""
    main = max(section.geoms, key=lambda g: g.length)
    touching = lines[(lines.index != own_id) & (lines.distance(section) < 3)]
    found = sorted(touching.items(), key=lambda kv: main.project(kv[1].centroid))
    return list(dict.fromkeys(names[i] for i, _ in found))


def wgs(geom: BaseGeometry, tolerance: float = 1.0) -> dict:
    """LV95 geometry -> simplified GeoJSON geometry in WGS84, ~1 m precision."""
    g = mapping(geom.simplify(tolerance))

    def conv(c):
        if isinstance(c[0], (int, float)):
            x, y = to_wgs84.transform(c[0], c[1])
            return [round(x, 5), round(y, 5)]
        return [conv(x) for x in c]

    return {"type": g["type"], "coordinates": conv(g["coordinates"])}


def lonlat(x: float, y: float) -> list[float]:
    lon, lat = to_wgs84.transform(x, y)
    return [round(lon, 5), round(lat, 5)]


def bbox(geom: BaseGeometry) -> list[float]:
    minx, miny, maxx, maxy = geom.bounds
    return [*lonlat(minx, miny), *lonlat(maxx, maxy)]


def main() -> None:
    gdb = fetch(STREETS + ".gdb.zip")
    street_csv = fetch(STREETS + ".csv.zip")
    addr_csv = fetch(ADDRESSES + ".csv.zip")

    st = pd.read_csv(street_csv, sep=";", encoding="utf-8-sig", low_memory=False)
    st = st[(st.COM_FOSNR == BFS_NR) & (st.STR_STATUS == "real")]
    names: dict[int, str] = dict(zip(st.STR_ESID, st.STN_LABEL))
    ids = ",".join(str(i) for i in st.STR_ESID)
    lines = gpd.read_file(gdb, layer="PURE_LIN", where=f"STR_ESID IN ({ids})").dissolve("STR_ESID").geometry
    areas = gpd.read_file(gdb, layer="PURE_PLY", where=f"STR_ESID IN ({ids})").dissolve("STR_ESID").geometry

    ad = pd.read_csv(addr_csv, sep=";", encoding="utf-8-sig", dtype={"ADR_NUMBER": str}, low_memory=False)
    ad = ad[(ad.COM_FOSNR == BFS_NR) & (ad.ADR_STATUS == "real")].copy()
    ad["n"] = ad.ADR_NUMBER.map(house_number)

    items = []
    for esid, name in sorted(names.items(), key=lambda kv: kv[1]):
        if esid in lines.index:
            geom, kind = lines[esid], "street"
        elif esid in areas.index:
            geom, kind = areas[esid], "area"
        else:
            print(f"skipping {name}: no geometry")
            continue
        item = {
            "id": str(esid),
            "name": name,
            "kind": kind,
            "lengthM": round(geom.length) if kind == "street" else None,
            "center": lonlat(*geom.representative_point().coords[0]),
            "bbox": bbox(geom),
            "geometry": wgs(geom),
            "sections": [],
        }
        if kind == "street" and geom.length > LONG_STREET_M:
            a = ad[(ad.STR_ESID == esid) & ad.n.notna()]
            k = section_count(geom.length, len(a))
            if k:
                ranges = number_ranges([int(n) for n in a.n], k)
                pts = [[Point(x, y) for x, y, n in zip(a.ADR_EASTING, a.ADR_NORTHING, a.n) if lo <= n <= hi] for lo, hi in ranges]
                for (lo, hi), sec in zip(ranges, section_geometries(geom, pts)):
                    if sec.is_empty:
                        continue
                    item["sections"].append(
                        {"from": lo, "to": hi, "crossStreets": cross_streets(sec, esid, lines, names), "geometry": wgs(sec)}
                    )
        items.append(item)

    station = ad[(ad.STN_LABEL == STATION[0]) & (ad.ADR_NUMBER == STATION[1])].iloc[0]
    all_geoms = pd.concat([lines, areas])
    out = {
        "source": "© swisstopo – Amtliches Strassenverzeichnis, Amtliches Gebäudeadressverzeichnis",
        "bbox": bbox(all_geoms.union_all()),
        "items": items,
        "station": lonlat(station.ADR_EASTING, station.ADR_NORTHING),
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
    long = [i for i in items if i["sections"]]
    print(f"{len(items)} items ({sum(i['kind'] == 'area' for i in items)} areas), {len(long)} with sections → {OUT} ({OUT.stat().st_size // 1024} KB)")
    for i in long:
        print(f"  {i['name']}: " + " | ".join(f"{s['from']}–{s['to']} {'/'.join(s['crossStreets'])}" for s in i["sections"]))


if __name__ == "__main__":
    main()
