# backend/tests/test_batch.py
import io

VALID_CSV = (
    "order_id,account_age_days,is_new_account,order_value,item_category,payment_method,"
    "discount_pct,shipping_billing_mismatch,ip_country_mismatch,device_reuse_signal,"
    "num_previous_orders,num_previous_returns,num_previous_chargebacks\n"
    "BATCH-1,30,false,2500,fashion,upi,10,false,false,false,3,0,0\n"
    "BATCH-2,1,true,45000,electronics,cod,2,true,true,true,0,0,2\n"
)

MISSING_COLUMNS_CSV = "order_id,order_value\nORD-1,1000\n"

PARTIALLY_BROKEN_CSV = (
    "order_id,account_age_days,is_new_account,order_value,item_category,payment_method,"
    "discount_pct,shipping_billing_mismatch,ip_country_mismatch,device_reuse_signal,"
    "num_previous_orders,num_previous_returns,num_previous_chargebacks\n"
    "GOOD-1,30,false,2000,fashion,upi,10,false,false,false,3,0,0\n"
    "BAD-1,notanumber,false,2000,fashion,upi,10,false,false,false,3,0,0\n"
)


def _upload(client, content: str, filename: str = "orders.csv"):
    return client.post(
        "/score/batch",
        files={"file": (filename, io.BytesIO(content.encode()), "text/csv")},
    )


def test_valid_csv_scores_every_row(client):
    resp = _upload(client, VALID_CSV)
    assert resp.status_code == 200
    body = resp.json()

    assert body["total_rows"] == 2
    assert body["scored_rows"] == 2
    assert body["failed_rows"] == 0
    assert body["csv_url"].startswith("/batch-files/")
    assert len(body["preview_rows"]) == 2


def test_missing_required_columns_returns_400(client):
    resp = _upload(client, MISSING_COLUMNS_CSV)
    assert resp.status_code == 400
    assert "Missing required column" in resp.json()["detail"]


def test_partial_failure_does_not_abort_whole_batch(client):
    """The core design decision in batch_scorer.py: one malformed row
    shouldn't fail the entire upload."""
    resp = _upload(client, PARTIALLY_BROKEN_CSV)
    assert resp.status_code == 200
    body = resp.json()

    assert body["scored_rows"] == 1
    assert body["failed_rows"] == 1

    good_row = next(r for r in body["preview_rows"] if r["order_id"] == "GOOD-1")
    bad_row = next(r for r in body["preview_rows"] if r["order_id"] == "BAD-1")
    assert good_row["error"] is None
    assert good_row["risk_score"] is not None
    assert bad_row["error"] is not None
    assert bad_row["risk_score"] is None


def test_non_csv_file_rejected(client):
    resp = client.post(
        "/score/batch",
        files={"file": ("orders.txt", io.BytesIO(b"not a csv"), "text/plain")},
    )
    assert resp.status_code == 400


def test_batch_result_csv_is_downloadable(client):
    upload_resp = _upload(client, VALID_CSV)
    csv_url = upload_resp.json()["csv_url"]

    download_resp = client.get(csv_url)
    assert download_resp.status_code == 200
    assert "attachment" in download_resp.headers["content-disposition"]
    assert b"chargeback_risk_score" in download_resp.content
