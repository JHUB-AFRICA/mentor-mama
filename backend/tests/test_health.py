

def test_liveness_answers_for_any_host_but_readiness_does_not(client, settings):
    """Platform probes call the container by IP; only the data-free liveness check skips host validation."""
    settings.ALLOWED_HOSTS = ["only.example"]
    live = client.get("/health/live", HTTP_HOST="10.0.0.12:8000")
    assert live.status_code == 200 and live.json()["status"] == "ok"
    assert client.head("/health/live", HTTP_HOST="10.0.0.12:8000").status_code == 200
    assert client.get("/health/ready", HTTP_HOST="10.0.0.12:8000").status_code == 400
