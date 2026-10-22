"""Build src/data/routes.json: the truck route from the Feuerwehrmagazin to every street,
house-number section and named area in src/data/town.json.

Run from this directory after build.py: `uv run routes.py`. The road network comes from
OpenStreetMap (© OpenStreetMap contributors, ODbL) via Overpass, cached in ./cache.

«Fastest for a large truck»: only roads a TLF can use, timed by road class, so big access
roads win over cutting through neighbourhoods; every turn at a junction costs extra time, so of
two similar routes the one with fewer turns wins. One-way streets are respected. A route ends
where it first reaches the street (or the section, or the area).
"""

import heapq
import json
import math
import urllib.parse
import urllib.request
from collections import defaultdict
from pathlib import Path

import numpy as np
import shapely
from pyproj import Transformer
from shapely.geometry import LineString, Point, shape

HERE = Path(__file__).parent
CACHE = HERE / "cache" / "osm-roads.json"
REGION = json.loads((HERE.parent / "region.json").read_text())
TOWN = HERE.parent / "src" / "data" / "town.json"
OUT = HERE.parent / "src" / "data" / "routes.json"
MARGIN = 0.01  # degrees of road network around the town (~1 km), for routes that leave town briefly

# km/h a loaded TLF realistically drives per OSM road class; anything missing is not drivable
SPEED = {
    "primary": 50,
    "secondary": 50,
    "tertiary": 40,
    "unclassified": 30,
    "residential": 25,
    "living_street": 15,
    "service": 12,
    "pedestrian": 8,
    "track": 8,
}
SERVICE_SKIP = {"parking_aisle", "driveway", "drive-through"}  # too tight for a truck
SLOW_ACCESS = {"private", "agricultural", "forestry"}  # passable in an emergency, but avoided
SLOW_SPEED = 8
TURN_S = {"right": 6, "left": 10, "sharp": 15}  # extra seconds per turn at a junction
STRAIGHT_DEG = 30  # a direction change below this at a junction is going straight on
TARGET_M = 25  # how close an OSM node must be to a street, section or area to count as on it
ACCESS_M = 200  # footpaths and fields: the route ends at the nearest drivable point this close

# Barriers (gates, bollards, chains …) take too long to open, so no route passes one. These kinds
# don't stop a truck.
OPEN_BARRIERS = {"no", "kerb", "cattle_grid", "border_control", "toll_booth", "entrance"}

# What the drivers know and OSM doesn't, from region.json: barriers missing in OSM (lon, lat; the
# nearest road node is closed), and residential streets they drive as access roads anyway (timed
# like a tertiary road).
BARRIERS = [tuple(b["at"]) for b in REGION["fixes"]["barriers"]]
ACCESS_ROADS = set(REGION["fixes"]["accessRoads"])

to_lv95 = Transformer.from_crs(4326, 2056, always_xy=True)


def overpass(bbox: list[float]) -> dict:
    """All highway ways in the bbox with their nodes, downloaded once."""
    if not CACHE.exists():
        w, s, e, n = bbox[0] - MARGIN, bbox[1] - MARGIN, bbox[2] + MARGIN, bbox[3] + MARGIN
        query = f"[out:json][timeout:90];way[highway]({s},{w},{n},{e});(._;>;);out body;"
        req = urllib.request.Request(
            "https://overpass-api.de/api/interpreter",
            data=urllib.parse.urlencode({"data": query}).encode(),
            headers={"User-Agent": f"strassen-trainer-data/1.0 ({REGION['brand']} street trainer)"},
        )
        print("downloading OSM roads …")
        CACHE.write_bytes(urllib.request.urlopen(req).read())
    return json.loads(CACHE.read_text())


def speed(tags: dict) -> float | None:
    """km/h for a TLF on this way, or None when a truck can't or mustn't use it."""
    kmh = SPEED.get(tags.get("highway", ""))
    if kmh is None or tags.get("service") in SERVICE_SKIP:
        return None
    access = tags.get("motor_vehicle", tags.get("access", "yes"))
    if access == "no" and tags.get("emergency") != "yes":
        return None
    if access in SLOW_ACCESS:
        return SLOW_SPEED
    return max(kmh, SPEED["tertiary"]) if tags.get("name") in ACCESS_ROADS else kmh


def bearing(a: tuple[float, float], b: tuple[float, float]) -> float:
    return math.degrees(math.atan2(b[0] - a[0], b[1] - a[1]))


def turn_cost(before: float, after: float) -> float:
    """Seconds for changing direction from bearing `before` to `after` at a junction."""
    d = (after - before + 540) % 360 - 180  # -180..180, positive = right
    if abs(d) < STRAIGHT_DEG:
        return 0
    if abs(d) > 135:
        return TURN_S["sharp"]
    return TURN_S["right"] if d > 0 else TURN_S["left"]


class Network:
    """Directed road graph in LV95 metres: node id -> [(next node, seconds)], plus way names.
    Barrier nodes have no edges, so routes go around them."""

    def __init__(self, osm: dict):
        self.xy: dict[int, tuple[float, float]] = {}
        self.lonlat: dict[int, tuple[float, float]] = {}
        barriers: set[int] = set()
        for el in osm["elements"]:
            if el["type"] == "node":
                self.lonlat[el["id"]] = (el["lon"], el["lat"])
                self.xy[el["id"]] = to_lv95.transform(el["lon"], el["lat"])
                if el.get("tags", {}).get("barrier", "no") not in OPEN_BARRIERS:
                    barriers.add(el["id"])
        self.out: dict[int, list[tuple[int, float]]] = defaultdict(list)
        self.names: dict[int, set[str]] = defaultdict(set)  # node -> names of drivable ways through it
        self.edge_name: dict[tuple[int, int], str] = {}
        degree: dict[int, int] = defaultdict(int)
        for el in osm["elements"]:
            if el["type"] != "way" or (kmh := speed(el["tags"])) is None:
                continue
            tags, nodes = el["tags"], el["nodes"]
            oneway = tags.get("oneway", "roundabout" if tags.get("junction") == "roundabout" else "no")
            for a, b in zip(nodes, nodes[1:]):
                self.edge_name[a, b] = self.edge_name[b, a] = tags.get("name", "")
                secs = math.dist(self.xy[a], self.xy[b]) / (kmh / 3.6)
                if oneway != "-1":
                    self.out[a].append((b, secs))
                if oneway in ("no", "false", "0") or oneway == "-1":
                    self.out[b].append((a, secs))
            for n in nodes:
                degree[n] += 1 if n in (nodes[0], nodes[-1]) else 2
                if "name" in tags:
                    self.names[n].add(tags["name"])
        self.junction = {n for n, d in degree.items() if d > 2}
        for ll in BARRIERS:
            xy = to_lv95.transform(*ll)
            if math.dist(self.xy[n := self.nearest(*xy)], xy) < 30:  # only on a road, not just anywhere
                barriers.add(n)
        for n in barriers & self.out.keys():
            del self.out[n]
        for n in self.out:
            self.out[n] = [(b, s) for b, s in self.out[n] if b not in barriers]

    def nearest(self, x: float, y: float) -> int:
        return min(self.out, key=lambda n: math.dist(self.xy[n], (x, y)))

    def shortest_tree(self, start: int) -> tuple[dict, dict]:
        """Turn-aware Dijkstra from `start`. States are (previous node, node), so a turn's cost
        depends on how you arrived. Returns cost and parent per state."""
        first = (-1, start)
        cost = {first: 0.0}
        parent: dict = {first: None}
        heap = [(0.0, first)]
        while heap:
            c, state = heapq.heappop(heap)
            if c > cost[state]:
                continue
            prev, node = state
            for nxt, secs in self.out[node]:
                if nxt == prev:
                    continue  # no U-turns
                extra = 0.0
                if prev != -1 and node in self.junction:
                    extra = turn_cost(bearing(self.xy[prev], self.xy[node]), bearing(self.xy[node], self.xy[nxt]))
                s = (node, nxt)
                if c + secs + extra < cost.get(s, math.inf):
                    cost[s] = c + secs + extra
                    parent[s] = state
                    heapq.heappush(heap, (cost[s], s))
        return cost, parent


def main() -> None:
    town = json.loads(TOWN.read_text())
    net = Network(overpass(town["bbox"]))
    start = net.nearest(*to_lv95.transform(*town["station"]))
    cost, parent = net.shortest_tree(start)
    best: dict[int, tuple[float, tuple]] = {}  # node -> cheapest state arriving there
    for state, c in cost.items():
        if c < best.get(state[1], (math.inf,))[0]:
            best[state[1]] = (c, state)

    def route_to(geometry: dict, name: str | None) -> tuple[list[list[float]], float, bool] | None:
        """The cheapest route to any reachable node on `geometry` (on a way called `name`, if
        given): its lon/lat path, its length in metres, and whether it ends at a substitute point."""
        g = shapely.transform(shape(geometry), lambda c: np.column_stack(to_lv95.transform(c[:, 0], c[:, 1])))
        zone = g.buffer(TARGET_M)
        on = [n for n in best if zone.contains(Point(net.xy[n]))]
        named = [n for n in on if name in net.names[n]]
        if named or on:
            node = min(named or on, key=lambda n: best[n][0])
        else:
            # no truck gets onto it: the closest drivable point instead
            node = min(best, key=lambda n: g.distance(Point(net.xy[n])))
            if g.distance(Point(net.xy[node])) > ACCESS_M:
                return None
        state = best[node][1]
        path = [state[1]]
        while state is not None and state[0] != -1:
            path.append(state[0])
            state = parent[state]
        path.reverse()
        if len(path) > 1:
            # thin out to ~2 m precision, keeping the original nodes
            keep = set(LineString([net.xy[n] for n in path]).simplify(2).coords)
            path = [n for n in path if net.xy[n] in keep]
        metres = sum(math.dist(net.xy[a], net.xy[b]) for a, b in zip(path, path[1:]))
        return [[round(c, 5) for c in net.lonlat[n]] for n in path], metres, not (named or on)

    # keys: "<id>" for streets and areas, "<id>:<section>" for house-number sections and
    # "<id>:start" for the end where a shorter street's numbering starts
    targets: list[tuple[str, dict, str | None]] = []
    for item in town["items"]:
        name = item["name"] if item["kind"] == "street" else None
        targets.append((item["id"], item["geometry"], name))
        targets += [(f"{item['id']}:{i}", sec["geometry"], name) for i, sec in enumerate(item["sections"])]
        if "ends" in item:
            targets.append((f"{item['id']}:start", {"type": "Point", "coordinates": item["ends"]["low"]}, name))
    routes: dict[str, list[list[float]]] = {}
    lengths: dict[str, float] = {}
    missing, substitute = [], []
    for key, geometry, name in targets:
        r = route_to(geometry, name)
        if r is None:
            missing.append(key)
            continue
        routes[key], lengths[key], sub = r
        if sub:
            substitute.append(key)
    OUT.write_text(json.dumps(routes, separators=(",", ":")))
    names = {i["id"]: i["name"] for i in town["items"]}
    label = lambda k: names[k.split(":")[0]] + (f" ({k.split(':')[1]})" if ":" in k else "")  # noqa: E731
    print(f"{len(routes)} routes → {OUT} ({OUT.stat().st_size // 1024} KB)")
    print(f"unreachable ({len(missing)}): {', '.join(map(label, missing)) or '–'}")
    print(f"ending at the nearest drivable point ({len(substitute)}): {', '.join(map(label, substitute)) or '–'}")
    longest = sorted(lengths, key=lengths.get, reverse=True)[:5]
    print("longest:", ", ".join(f"{label(k)} {lengths[k]:.0f} m" for k in longest))


if __name__ == "__main__":
    main()
