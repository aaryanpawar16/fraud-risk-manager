# backend/tests/test_health.py
def test_health_check_returns_ok(client):
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "risk-manager-api"
