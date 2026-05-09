import main


def route_paths():
    return {
        getattr(route, "path", "")
        for route in main.app.routes
        if getattr(route, "path", "")
    }


def test_core_routes_remain_registered_after_route_split():
    paths = route_paths()

    expected = {
        "/",
        "/admin",
        "/admin-react",
        "/api/admin/login",
        "/api/admin/logout",
        "/api/admin/react-overview",
        "/api/state/{user}",
        "/api/game/{user}",
        "/api/advance",
        "/api/heartbeat",
        "/api/events/sync",
        "/api/admin/events",
        "/api/admin/events/mark",
    }

    missing = expected - paths
    assert not missing, f"Missing expected routes after split: {sorted(missing)}"


def test_route_modules_are_registered_after_split():
    route_modules = {
        "backend.app.routes.admin",
        "backend.app.routes.events",
        "backend.app.routes.player",
        "backend.app.routes.web",
    }

    for module_name in route_modules:
        module = __import__(module_name, fromlist=["router", "ROUTE_FUNCTIONS"])
        assert hasattr(module, "router")
        assert isinstance(module.ROUTE_FUNCTIONS, list)
        assert module.ROUTE_FUNCTIONS


def test_root_smoke_entrypoint_is_registered_early():
    root_routes = [
        route
        for route in main.app.routes
        if getattr(route, "path", "") == "/"
    ]

    assert root_routes
    assert getattr(root_routes[0], "endpoint").__name__ == "root_smoke_entrypoint"
