# backend/tests/test_graph.py
def test_graph_returns_expected_shape(client):
    resp = client.get("/graph")
    assert resp.status_code == 200
    body = resp.json()

    for key in ("nodes", "links", "ring_count"):
        assert key in body

    assert body["ring_count"] >= 0
    assert isinstance(body["nodes"], list)
    assert isinstance(body["links"], list)


def test_graph_node_types_are_valid(client):
    nodes = client.get("/graph").json()["nodes"]
    for node in nodes:
        assert node["type"] in ("customer", "device", "address")
        assert "id" in node and node["id"]


def test_graph_links_reference_existing_nodes(client):
    """A real structural invariant: every link's source/target should
    point at a node that's actually in the response. If graph_engine.py
    ever included an edge to a node it forgot to add to the node list,
    this would catch it — the frontend's force-graph would otherwise
    silently drop that edge with no error."""
    body = client.get("/graph").json()
    node_ids = {n["id"] for n in body["nodes"]}

    for link in body["links"]:
        assert link["source"] in node_ids, f"link source {link['source']} not in node list"
        assert link["target"] in node_ids, f"link target {link['target']} not in node list"


def test_rings_are_sorted_worst_first(client):
    """The severity-sort fix: rings must come back in descending
    max_risk_score order, not whatever arbitrary order NetworkX happens
    to yield connected components in. If this regressed, a ring with a
    100%-chargeback customer could silently fall outside the 60-ring
    display cap while a milder ring took its place."""
    rings = client.get("/graph").json()["rings"]
    scores = [r["max_risk_score"] for r in rings]
    assert scores == sorted(scores, reverse=True)


def test_ring_count_is_true_total_not_capped_display_count(client):
    """ring_count must reflect every qualifying ring in the whole
    dataset, not just the (possibly much smaller) number actually
    rendered in the capped nodes/links payload."""
    body = client.get("/graph").json()
    assert body["ring_count"] >= len(body["rings"])


def test_every_node_ring_id_matches_a_real_ring_summary(client):
    """Every node's ring_id should resolve to an actual entry in the
    rings list — this is what lets the frontend look up "who else is in
    this cluster" from a clicked node without doing its own graph
    traversal client-side."""
    body = client.get("/graph").json()
    valid_ring_ids = {r["ring_id"] for r in body["rings"]}
    for node in body["nodes"]:
        assert node["ring_id"] in valid_ring_ids


def test_ring_connection_type_matches_actual_node_types_present(client):
    """connection_type should honestly reflect what's actually in that
    ring — "device" only if a device node is present, "address" only if
    an address node is present, "both" if both are."""
    body = client.get("/graph").json()
    nodes_by_ring: dict = {}
    for node in body["nodes"]:
        nodes_by_ring.setdefault(node["ring_id"], set()).add(node["type"])

    for ring in body["rings"]:
        types_present = nodes_by_ring.get(ring["ring_id"], set())
        has_device = "device" in types_present
        has_address = "address" in types_present
        if ring["connection_type"] == "device":
            assert has_device and not has_address
        elif ring["connection_type"] == "address":
            assert has_address and not has_device
        else:
            assert ring["connection_type"] == "both"
            assert has_device and has_address


def test_ring_members_sorted_by_risk_score_descending(client):
    rings = client.get("/graph").json()["rings"]
    for ring in rings:
        scores = [m["risk_score"] for m in ring["members"]]
        assert scores == sorted(scores, reverse=True)
        assert ring["max_risk_score"] == max(scores) if scores else True
