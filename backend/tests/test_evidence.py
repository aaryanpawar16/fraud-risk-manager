# backend/tests/test_evidence.py
"""
Uses a real order_id pulled from the actual holdout data rather than a
hardcoded one, since evidence_builder.py looks orders up by ID from
data/train.csv + data/test_holdout.csv — a hardcoded ID would silently
break this suite if the underlying dataset ever gets regenerated with a
different seed.
"""

import pandas as pd
import pytest

from app.config import DATA_DIR


@pytest.fixture(scope="module")
def real_order_id():
    df = pd.read_csv(DATA_DIR / "test_holdout.csv")
    return str(df.iloc[0]["order_id"])


def test_generate_evidence_for_real_order(client, real_order_id):
    resp = client.post(f"/evidence/{real_order_id}")
    assert resp.status_code == 200
    body = resp.json()

    assert body["order_id"] == real_order_id
    assert len(body["sections"]) == 7  # order, risk assessment, device/IP, history, network, shipping, policy
    assert body["pdf_url"] == f"/evidence-files/{real_order_id}.pdf"


def test_generate_evidence_for_nonexistent_order_returns_404(client):
    resp = client.post("/evidence/THIS-ORDER-DOES-NOT-EXIST-999")
    assert resp.status_code == 404


def test_evidence_pdf_downloads_with_correct_headers(client, real_order_id):
    # Generate first, then download
    client.post(f"/evidence/{real_order_id}")
    resp = client.get(f"/evidence-files/{real_order_id}.pdf")

    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/pdf"
    assert "attachment" in resp.headers["content-disposition"]
    assert real_order_id in resp.headers["content-disposition"]
    assert resp.content[:4] == b"%PDF"  # real PDF magic bytes, not placeholder text


def test_evidence_pdf_download_404s_if_never_generated(client):
    resp = client.get("/evidence-files/NEVER-GENERATED-ORDER.pdf")
    assert resp.status_code == 404


def test_evidence_pdf_path_traversal_is_rejected(client):
    """The download route strips directory components from the
    filename — confirm a path-traversal attempt doesn't escape the
    evidence directory."""
    resp = client.get("/evidence-files/..%2F..%2F..%2Fetc%2Fpasswd.pdf")
    assert resp.status_code in (400, 404)


# ---------------------------------------------------------------------------
# The two newer sections — risk assessment and network check — cross-checked
# against the actual /score and /graph endpoints, not just checked for
# presence, since the whole point of adding them was tying the evidence
# packet back to the app's real scoring and ring-detection logic.
# ---------------------------------------------------------------------------


def test_risk_assessment_section_matches_a_real_score_call(client, real_order_id):
    """The percentage embedded in the risk-assessment section's text
    should exactly match what POST /score independently returns for the
    same order's underlying data — proving the evidence packet is
    genuinely re-scoring through the real model, not showing a
    fabricated or hardcoded number."""
    df = pd.read_csv(DATA_DIR / "test_holdout.csv")
    row = df[df["order_id"] == real_order_id].iloc[0]

    score_payload = {
        "order_id": real_order_id,
        "account_age_days": int(row["account_age_days"]),
        "is_new_account": bool(row["is_new_account"]),
        "order_value": float(row["order_value"]),
        "item_category": str(row["item_category"]),
        "payment_method": str(row["payment_method"]),
        "discount_pct": float(row["discount_pct"]),
        "shipping_billing_mismatch": bool(row["shipping_billing_mismatch"]),
        "ip_country_mismatch": bool(row["ip_country_mismatch"]),
        "device_reuse_signal": bool(row["device_reuse_signal"]),
        "num_previous_orders": int(row["num_previous_orders"]),
        "num_previous_returns": int(row["num_previous_returns"]),
        "num_previous_chargebacks": int(row["num_previous_chargebacks"]),
    }
    score_resp = client.post("/score", json=score_payload).json()
    expected_pct = f"{score_resp['risk_score']:.1%}"

    evidence = client.post(f"/evidence/{real_order_id}").json()
    risk_section = next(s for s in evidence["sections"] if s["title"] == "Risk assessment at time of scoring")

    assert expected_pct in risk_section["content"]
    assert score_resp["risk_band"] in risk_section["content"]


def test_network_check_reports_a_real_flagged_customer(client):
    """Finds a customer who's genuinely in a real abuse ring (via the
    actual /graph endpoint, not a synthetic fixture), generates evidence
    for one of their real orders, and confirms the network check section
    honestly reports the flag rather than defaulting to the clean-report
    text."""
    graph = client.get("/graph").json()
    assert len(graph["rings"]) > 0, "expected at least one real ring to test against"
    flagged_customer_id = graph["rings"][0]["members"][0]["label"]

    df = pd.concat([pd.read_csv(DATA_DIR / "train.csv"), pd.read_csv(DATA_DIR / "test_holdout.csv")], ignore_index=True)
    order_row = df[df["customer_id"] == flagged_customer_id].iloc[0]
    order_id = str(order_row["order_id"])

    evidence = client.post(f"/evidence/{order_id}").json()
    network_section = next(s for s in evidence["sections"] if s["title"] == "Network check — shared-identity rings")

    assert "Flag on file" in network_section["content"]
    assert "no network flags" not in network_section["content"]


def test_network_check_reports_clean_for_an_unconnected_customer(client, real_order_id):
    """The inverse check — an order whose customer genuinely isn't in
    any ring should get the honest "no flags" text, not a false
    positive."""
    evidence = client.post(f"/evidence/{real_order_id}").json()
    network_section = next(s for s in evidence["sections"] if s["title"] == "Network check — shared-identity rings")

    graph = client.get("/graph").json()
    all_flagged_ids = {m["label"] for r in graph["rings"] for m in r["members"]}

    df = pd.read_csv(DATA_DIR / "test_holdout.csv")
    this_customer = df[df["order_id"] == real_order_id].iloc[0]["customer_id"]

    if this_customer not in all_flagged_ids:
        assert "no network flags on file" in network_section["content"]


def test_every_flaggable_section_uses_the_consistent_flag_prefix(client):
    """The frontend detects a flagged section by checking whether its
    content starts with "Flag on file" (see Evidence.tsx's isFlagged).
    All three sections capable of disclosing a flag (device/IP, network
    check, shipping/billing) must use that exact prefix consistently —
    a section using different wording for the same concept would
    silently fail to get the frontend's amber tint and "Flagged" badge,
    which is exactly the kind of inconsistency that's easy to introduce
    when different sections get written at different times."""
    df = pd.concat([pd.read_csv(DATA_DIR / "train.csv"), pd.read_csv(DATA_DIR / "test_holdout.csv")], ignore_index=True)
    flaggable_titles = {"Device & IP match", "Network check — shared-identity rings", "Shipping & billing match"}

    checked_flagged_instance = False
    for order_id in df["order_id"].sample(n=min(60, len(df)), random_state=1):
        evidence = client.post(f"/evidence/{order_id}").json()
        for section in evidence["sections"]:
            if section["title"] not in flaggable_titles:
                continue
            if "matched" in section["content"] or "does not share" in section["content"]:
                continue  # this particular instance is the clean-state text, not a flag
            checked_flagged_instance = True
            assert section["content"].startswith(
                "Flag on file"
            ), f"{section['title']} has non-clean content that doesn't use the consistent flag prefix: {section['content'][:80]}"

    assert checked_flagged_instance, "sample didn't include any flagged section — widen the sample or seed"
