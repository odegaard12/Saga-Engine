from fastapi.testclient import TestClient

import main


def make_client():
    return TestClient(main.app)


def test_root_route_does_not_require_query_params():
    response = make_client().get("/")

    assert response.status_code in {200, 503}
    assert response.status_code != 422
    assert "text/html" in response.headers.get("content-type", "")


def test_admin_redirect_keeps_legacy_admin_entrypoint():
    response = make_client().get("/admin", follow_redirects=False)

    assert response.status_code == 307
    assert response.headers["location"] == "/admin-react"


def test_service_worker_block_routes_return_javascript():
    client = make_client()

    for path in ("/sw.js", "/service-worker.js"):
        response = client.get(path)
        assert response.status_code == 200
        assert "application/javascript" in response.headers.get("content-type", "")
        assert response.headers["Cache-Control"].startswith("no-store")
