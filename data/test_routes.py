from routes import TURN_S, Network, turn_cost


def test_turns_cost_more_to_the_left_and_nothing_straight_on():
    assert turn_cost(0, 10) == 0
    assert turn_cost(0, 90) == TURN_S["right"]
    assert turn_cost(0, -90) == TURN_S["left"]
    assert turn_cost(0, 170) == TURN_S["sharp"]


def test_routes_go_around_a_barrier():
    # a straight road 1–2–3 with a gate on 2, and a detour 1–4–3
    def node(i, lon, lat, **tags):
        return {"type": "node", "id": i, "lon": lon, "lat": lat, "tags": tags}

    osm = {
        "elements": [
            node(1, 7.550, 47.510),
            node(2, 7.551, 47.510, barrier="gate"),
            node(3, 7.552, 47.510),
            node(4, 7.551, 47.511),
            {"type": "way", "id": 10, "nodes": [1, 2, 3], "tags": {"highway": "residential"}},
            {"type": "way", "id": 11, "nodes": [1, 4, 3], "tags": {"highway": "residential"}},
        ]
    }
    net = Network(osm)
    cost, parent = net.shortest_tree(1)
    reached = {state[1]: state for state in cost}
    assert 2 not in reached
    assert parent[reached[3]][1] == 4
