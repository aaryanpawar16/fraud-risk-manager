# backend/app/services/graph_engine.py
"""
Builds the shared-identity graph the frontend's AbuseGraph page renders.

Naive approach (an earlier version of this file) treated ANY shared
device_id or shipping_address_hash as a ring edge. That produced a
28,000-node single giant blob in testing — not a bug in the clustering,
but a real property of the synthetic dataset: generate_synthetic_data.py
draws devices/addresses from finite pools (~60-65% of order count), so at
20k+ orders, incidental collisions between UNRELATED customers happen
constantly by chance (a birthday-paradox effect), and those incidental
links chain transitively into one massive component that swallows most
of the dataset.

The fix: only treat a shared device/address as a ring signal if the
customers who used it did so within a tight time window. This mirrors
exactly how generate_synthetic_data.py actually builds its deliberate
rings — ring orders cluster within ~4 days of each other — while
incidental pool reuse is scattered across the full ~18 month span. This
is legitimate fraud-detection logic (identity + recency clustering), not
a read of the dataset's ground-truth ring label, which stays untouched
and unused here, same as it's excluded from model training.

A second fix, added later: the response payload caps at max_rings (60)
for size, but rings are now sorted by severity (worst customer risk
score in the ring, ties broken toward device-based rings) BEFORE that
cap is applied — not left in whatever arbitrary order NetworkX happens
to yield connected components in. Capping first would mean the 60 rings
actually shown could be an arbitrary sample rather than the 60 most
worth an analyst's attention.
"""

from pathlib import Path
from typing import Optional

import networkx as nx
import pandas as pd

from app.config import DATA_DIR
from app.models.schemas import AbuseGraphData, GraphLink, GraphNode, RingMember, RingSummary

_cache: Optional[AbuseGraphData] = None
_component_cache: Optional[tuple] = None  # (qualifying_components, graph) — the FULL uncapped set

# Orders sharing a device/address within this window are treated as a
# suspicious cluster; wider than this is assumed to be incidental pool
# reuse rather than a coordinated ring.
TIME_WINDOW_DAYS = 10
MIN_DISTINCT_CUSTOMERS = 2


def _load_orders() -> pd.DataFrame:
    train = pd.read_csv(Path(DATA_DIR) / "train.csv", parse_dates=["timestamp"])
    holdout = pd.read_csv(Path(DATA_DIR) / "test_holdout.csv", parse_dates=["timestamp"])
    return pd.concat([train, holdout], ignore_index=True)


def _customer_risk(df: pd.DataFrame) -> dict:
    """Rough per-customer risk proxy: share of that customer's orders that
    resulted in a chargeback. Used only to color/annotate nodes, not for
    any actual decisioning."""
    return df.groupby("customer_id")["chargeback"].mean().to_dict()


def _suspicious_identifiers(df: pd.DataFrame, id_col: str) -> set:
    """Identifiers (device_id or shipping_address_hash) used by 2+ distinct
    customers within TIME_WINDOW_DAYS of each other."""
    grouped = df.groupby(id_col).agg(
        n_customers=("customer_id", "nunique"),
        min_ts=("timestamp", "min"),
        max_ts=("timestamp", "max"),
    )
    grouped["span_days"] = (grouped["max_ts"] - grouped["min_ts"]).dt.total_seconds() / 86400
    suspicious = grouped[(grouped["n_customers"] >= MIN_DISTINCT_CUSTOMERS) & (grouped["span_days"] <= TIME_WINDOW_DAYS)]
    return set(suspicious.index)


def _get_qualifying_components() -> tuple:
    """Computes and caches every qualifying ring (>= MIN_DISTINCT_CUSTOMERS)
    across the WHOLE dataset, sorted worst-first — not capped to any
    display limit. build_graph() takes only the first max_rings of this
    for the visualization payload, but other callers (the evidence
    packet's network check) need to search the complete set: a
    customer's ring could rank outside the graph UI's top 60 by severity
    and still be a real, relevant finding for a specific order."""
    global _component_cache
    if _component_cache is not None:
        return _component_cache

    df = _load_orders()
    risk_by_customer = _customer_risk(df)
    suspicious_devices = _suspicious_identifiers(df, "device_id")
    suspicious_addresses = _suspicious_identifiers(df, "shipping_address_hash")

    g = nx.Graph()
    relevant = df[df["device_id"].isin(suspicious_devices) | df["shipping_address_hash"].isin(suspicious_addresses)]

    for _, row in relevant.iterrows():
        cust = f"cust::{row['customer_id']}"
        if row["device_id"] in suspicious_devices:
            g.add_edge(cust, f"dev::{row['device_id']}")
        if row["shipping_address_hash"] in suspicious_addresses:
            g.add_edge(cust, f"addr::{row['shipping_address_hash']}")

    qualifying_components = []
    for component in nx.connected_components(g):
        customers_in_component = {n for n in component if n.startswith("cust::")}
        if len(customers_in_component) < MIN_DISTINCT_CUSTOMERS:
            continue

        customer_risks = [round(float(risk_by_customer.get(c.split("::", 1)[1], 0.0)), 3) for c in customers_in_component]
        has_device = any(n.startswith("dev::") for n in component)
        has_address = any(n.startswith("addr::") for n in component)
        connection_type = "both" if (has_device and has_address) else ("device" if has_device else "address")

        qualifying_components.append(
            {
                "component": component,
                "max_risk_score": max(customer_risks) if customer_risks else 0.0,
                "connection_type": connection_type,
            }
        )

    # Worst rings first — a shared device (a much stronger signal than a
    # shared address; families and roommates legitimately share
    # addresses, sharing an actual device fingerprint is rarer) breaks
    # ties in favor of showing the more actionable ring type.
    qualifying_components.sort(key=lambda c: (c["max_risk_score"], c["connection_type"] == "device"), reverse=True)

    _component_cache = (qualifying_components, g)
    return _component_cache


def build_graph(max_rings: int = 60) -> AbuseGraphData:
    global _cache
    if _cache is not None:
        return _cache

    df = _load_orders()
    risk_by_customer = _customer_risk(df)
    qualifying_components, g = _get_qualifying_components()
    ring_count = len(qualifying_components)  # true total, independent of the display cap below

    nodes: list[GraphNode] = []
    links: list[GraphLink] = []
    rings: list[RingSummary] = []
    seen_nodes = set()

    for ring_id, entry in enumerate(qualifying_components[:max_rings]):
        component = entry["component"]
        subgraph = g.subgraph(component)
        members: list[RingMember] = []

        for node_id in component:
            if node_id.startswith("cust::"):
                raw_id = node_id.split("::", 1)[1]
                score = round(float(risk_by_customer.get(raw_id, 0.0)), 3)
                members.append(RingMember(id=node_id, label=raw_id, risk_score=score))
                if node_id not in seen_nodes:
                    seen_nodes.add(node_id)
                    nodes.append(GraphNode(id=node_id, type="customer", label=raw_id, risk_score=score, ring_id=ring_id))
            elif node_id.startswith("dev::"):
                if node_id not in seen_nodes:
                    seen_nodes.add(node_id)
                    raw_id = node_id.split("::", 1)[1]
                    nodes.append(GraphNode(id=node_id, type="device", label=f"Device {raw_id[-6:]}", ring_id=ring_id))
            else:
                if node_id not in seen_nodes:
                    seen_nodes.add(node_id)
                    raw_id = node_id.split("::", 1)[1]
                    nodes.append(GraphNode(id=node_id, type="address", label=f"Address {raw_id[-6:]}", ring_id=ring_id))

        for source, target in subgraph.edges():
            links.append(GraphLink(source=source, target=target))

        members.sort(key=lambda m: m.risk_score, reverse=True)
        rings.append(
            RingSummary(
                ring_id=ring_id,
                customer_count=len(members),
                connection_type=entry["connection_type"],
                max_risk_score=entry["max_risk_score"],
                members=members,
            )
        )

    result = AbuseGraphData(nodes=nodes, links=links, ring_count=ring_count, rings=rings)
    _cache = result
    return result


def find_customer_ring(customer_id: str) -> Optional[dict]:
    """Searches the FULL set of qualifying rings (not just the 60 shown
    in the graph UI) for a specific customer — used by the evidence
    packet's network check. Returns ring details if found, or None if
    genuinely clean. Deliberately does not reuse build_graph()'s capped
    output for this — a customer's ring could rank outside the top 60 by
    severity and still be a real, relevant finding for one specific
    order's evidence packet."""
    qualifying_components, _ = _get_qualifying_components()
    target = f"cust::{customer_id}"

    for entry in qualifying_components:
        if target in entry["component"]:
            customer_count = len({n for n in entry["component"] if n.startswith("cust::")})
            return {
                "customer_count": customer_count,
                "connection_type": entry["connection_type"],
                "max_risk_score": entry["max_risk_score"],
            }
    return None

