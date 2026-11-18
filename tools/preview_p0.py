#!/usr/bin/env python3
"""Loopback-only P0-1 QA fixture. No upstream requests, real keys or persistence.

Run: python tools/preview_p0.py --scenario unknown --port 55231
Open http://127.0.0.1:55231/ ; fixture control: /__fixture__/
This serves current static assets with an unmistakable fixture banner. It is
not a substitute for production integration or a physical execution test.
"""
from __future__ import annotations

import argparse
import copy
from datetime import datetime, timezone, timedelta
import hashlib
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
from pathlib import Path
import threading
import time
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = ("empty", "offline", "unknown", "accepted", "failed", "unauth", "conflict", "missing", "rejected", "dispatching")
ASSETS = frozenset({"index.html", "app.js", "fleet-api.js", "portal-state.js", "command-receipts.js", "styles.css",
                    "editor.html", "editor.js", "editor.css", "icon.svg", "manifest.webmanifest", "sw.js"})
FIXTURE_KEY = "fixture-only-key"


def timestamp():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def fault(code, message, category="protocol", retry="query_status"):
    return {"protocolVersion": "1.0", "error": {"code": code, "category": category, "message": message, "retry": retry}}


class Fixture:
    def __init__(self, scenario):
        self.lock = threading.RLock()
        self.reset(scenario)

    def reset(self, scenario):
        if scenario not in SCENARIOS:
            raise ValueError("Unknown fixture scenario")
        with self.lock:
            self.scenario, self.receipts, self.bodies, self.orders = scenario, {}, {}, {}
            self.command_post_count, self.command_posts_by_request_id = 0, {}
            self.generation = getattr(self, "generation", 0)+1
            self.revision = 1
            if scenario in {"unknown", "accepted", "failed"}:
                self.submit({"protocolVersion": "1.0", "requestId": "fixture-"+scenario,
                             "issuedAt": timestamp(), "expiresAt": (datetime.now(timezone.utc)+timedelta(seconds=60)).isoformat(),
                             "command": {"type": "create_order", "robotId": "AGV-01", "destination": "B"}})

    def info(self):
        with self.lock:
            return {"fixture": True, "scenario": self.scenario, "generation": self.generation,
                    "upstreamRequests": 0, "persistent": False, "requestIds": list(self.receipts), "key": FIXTURE_KEY,
                    "commandPostCount": self.command_post_count,
                    "commandPostsByRequestId": dict(self.command_posts_by_request_id)}

    def state(self):
        with self.lock:
            empty, offline = self.scenario == "empty", self.scenario == "offline"
            return {"robots": [] if empty else [{"id": "AGV-01", "name": "Fixture vehicle — not connected",
                "status": "IDLE", "online": not offline, "paused": False, "battery": None,
                "x": 0., "y": 0., "velocity": None, "task": next(iter(self.orders), None), "location": "P-A",
                "processingState": "IDLE", "source": "openTCS", "stale": offline}],
                "orders": copy.deepcopy(list(self.orders.values())), "upstreamOnline": not offline,
                "upstreamAgeSeconds": 60. if offline else .2, "revision": self.revision,
                "freshnessSource": "FIXTURE openTCS API age only; no robot heartbeat exists"}

    def submit(self, body):
        request_id, command = body.get("requestId"), body.get("command", {})
        if not isinstance(request_id, str) or not isinstance(command, dict):
            return 422, fault("INVALID_MESSAGE", "Fixture requires requestId and command")
        with self.lock:
            if request_id in self.receipts:
                if self.bodies[request_id] != body:
                    return 409, fault("REQUEST_ID_CONFLICT", "Same requestId, different original envelope", retry="correct_request")
                value = copy.deepcopy(self.receipts[request_id])
                return (202 if value["status"] in {"UNKNOWN", "DISPATCHING"} else 200), value
            if self.scenario == "conflict":
                return 409, fault("REQUEST_ID_CONFLICT", "Named fixture HTTP 409; retain original envelope", retry="correct_request")
            operation = command.get("type")
            if operation not in {"create_order", "pause", "resume", "cancel_order"}:
                return 422, fault("INVALID_MESSAGE", "Unsupported fixture operation")
            order_id = command.get("orderId") if operation == "cancel_order" else "fleet-"+hashlib.sha256(request_id.encode()).hexdigest()[:32]
            resource = ({"type": "robot", "id": command.get("robotId")} if operation in {"pause", "resume"}
                        else {"type": "transport_order", "id": order_id})
            status = "UNKNOWN" if self.scenario in {"unknown", "offline"} else "DISPATCHING" if self.scenario == "dispatching" else "REJECTED" if self.scenario == "rejected" else "ACCEPTED"
            result = None
            error = {"code": "UPSTREAM_UNCERTAIN", "category": "transport", "message": "Fixture: upstream reply lost; execution unknown", "retry": "query_status"} if status == "UNKNOWN" else (
                {"code": "COMMAND_EXPIRED", "category": "protocol", "message": "Named fixture rejection (not execution)", "retry": "correct_request"} if status == "REJECTED" else None)
            if operation == "create_order" and status not in {"REJECTED", "DISPATCHING"}:
                order = {"name": order_id, "state": "FAILED" if self.scenario == "failed" else "BEING_PROCESSED",
                         "creationTime": timestamp(), "intendedVehicle": command.get("robotId"), "processingVehicle": "AGV-01",
                         "destinations": [{"locationName": "Station-"+str(command.get("destination", "B")), "operation": "NOP"}],
                         "driveOrders": [], "properties": {"fixture": "not real execution"}}
                self.orders[order_id] = order
                if status == "ACCEPTED":
                    result = {"id": order_id, "replayed": False, "order": copy.deepcopy(order), "confirmation": "accepted by openTCS, not vehicle arrival"}
            elif operation != "create_order" and status == "ACCEPTED":
                result = {"id": resource["id"], "confirmation": "Fixture request only; no physical action"}
                if operation in {"pause", "resume"}:
                    result["requestedPaused"] = operation == "pause"
            receipt = {"protocolVersion": "1.0", "requestId": request_id, "status": status, "updatedAt": timestamp(),
                       "result": result, "error": error, "resource": resource,
                       "confirmation": "Receipt is not physical completion; FIXTURE ONLY"}
            self.receipts[request_id], self.bodies[request_id] = receipt, copy.deepcopy(body)
            self.revision += 1
            return (202 if status in {"UNKNOWN", "DISPATCHING"} else 200), copy.deepcopy(receipt)


def handler_class(fixture):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, fmt, *args):
            # No headers, request bodies or credentials enter fixture logs.
            print(f"fixture {self.command} {urlsplit(self.path).path}", flush=True)

        def send(self, status, data, content_type="application/json; charset=utf-8"):
            raw = json.dumps(data, ensure_ascii=False).encode() if isinstance(data, (dict, list)) else data
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-AGV-Fixture", "P0-1/"+fixture.scenario+"; no upstream")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.end_headers()
            self.wfile.write(raw)

        def authorized(self, fixture_control=False):
            origin = self.headers.get("Origin")
            if origin and origin not in {"http://127.0.0.1:"+str(self.server.server_port), "http://localhost:"+str(self.server.server_port)}:
                self.send(403, fault("ORIGIN_DENIED", "Fixture accepts same-origin requests only"))
                return False
            if (fixture.scenario == "unauth" and not fixture_control) or self.headers.get("X-Fleet-Key") != FIXTURE_KEY:
                self.send(401, fault("AUTH_REQUIRED", "Use the displayed fixture-only key, never a real key", retry="authenticate"))
                return False
            return True

        def do_GET(self):
            parsed = urlsplit(self.path)
            path, query = unquote(parsed.path), parse_qs(parsed.query)
            if path in {"/", "/index.html"} and query.get("fixture"):
                try:
                    scenario = query["fixture"][0]
                    if scenario not in SCENARIOS:
                        raise ValueError("Unknown fixture scenario")
                    if scenario != fixture.scenario:
                        fixture.reset(scenario)
                except ValueError:
                    return self.send(400, fault("INVALID_FIXTURE", "Unknown named scenario"))
            if path in {"/__fixture__", "/__fixture__/"}:
                links = " ".join(f'<a href="/?fixture={name}">{name}</a>' for name in SCENARIOS)
                return self.send(200, ("<!doctype html><meta charset=utf-8><title>P0-1 fixture</title><h1>LOCAL FIXTURE ONLY</h1>"
                    "<p>No upstream network, real keys, physical robots or persistence. Key: <code>"+FIXTURE_KEY+"</code></p>"
                    "<p>Same-scenario refresh preserves memory and counters. Explicit reset: POST /__fixture__/reset with JSON {scenario: name} and the fixture-only key. This is not a product endpoint.</p>"+links).encode(), "text/html; charset=utf-8")
            if path == "/__fixture__/info":
                return self.send(200, fixture.info())
            if path == "/api/v1/events":
                self.send_response(200)
                self.send_header("Content-Type", "text/event-stream")
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-AGV-Fixture", "P0-1; no upstream")
                self.end_headers()
                try:
                    for _ in range(90):
                        self.wfile.write(("event: fleet\ndata: "+json.dumps(fixture.state())+"\n\n").encode())
                        self.wfile.flush()
                        time.sleep(1)
                except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
                    pass
                return
            if path == "/api/v1/robots":
                return self.send(200, fixture.state())
            if path == "/api/v1/health/live":
                return self.send(200, {"service": "P0-1-FIXTURE", "alive": True, "protocolVersion": "1.0"})
            if path == "/api/v1/health/ready":
                return self.send(503 if fixture.scenario == "offline" else 200, {"ready": fixture.scenario != "offline", "scope": "FIXTURE API freshness only"})
            if path == "/api/v1/layout":
                return self.send(200, {"bounds": {"min_x": -1, "max_x": 3, "min_y": -1, "max_y": 2},
                    "points": [] if fixture.scenario == "empty" else [{"id": name, "name": "Fixture station "+name,
                        "destination": "Station-"+name, "x": x, "y": 0} for name, x in (("A", 0), ("B", 2))]})
            if path == "/api/v1/model":
                empty = fixture.scenario == "empty"
                return self.send(200, {"name": "FIXTURE ONLY", "source": "openTCS", "units": "m", "layers": [],
                    "points": [] if empty else [{"id": "P-"+n, "x": x, "y": 0, "type": "HALT_POSITION"} for n, x in (("A", 0), ("B", 2))],
                    "paths": [] if empty else [{"id": "P-A--P-B", "source": "P-A", "target": "P-B", "locked": False, "length": 2., "maxVelocity": .05, "connectionType": "DIRECT", "controlPoints": []}],
                    "stations": [] if empty else [{"id": "Station-"+n, "x": x, "y": .3, "links": ["P-"+n], "locked": False} for n, x in (("A", 0), ("B", 2))]})
            if path == "/api/v1/map-background":
                return self.send(200, {"available": False, "map": None})
            if path == "/api/v1/capabilities":
                return self.send(200, {"protocolVersion": "1.0", "profile": "linorobot-straight/1.0", "commands": ["create_order", "pause", "resume", "cancel_order"],
                    "robotIds": [] if fixture.scenario == "empty" else ["AGV-01"], "destinations": [] if fixture.scenario == "empty" else ["A", "B"],
                    "motion": {"edges": "straight", "transportOperation": "NOP", "manualDriving": False}})
            if path.startswith("/api/v1/commands/"):
                if not self.authorized(): return
                request_id = path.rsplit("/", 1)[-1]
                value = fixture.receipts.get(request_id)
                return self.send(200, value) if value else self.send(404, fault("REQUEST_NOT_FOUND", "Fixture receipt not found; absence is not proof of no side effect", retry="correct_request"))
            if path.startswith("/api/v1/orders/"):
                value = fixture.orders.get(path.rsplit("/", 1)[-1])
                if fixture.scenario == "missing": value = None
                return self.send(200, value) if value else self.send(404, fault("UPSTREAM_REJECTED", "Fixture kernel order was not found", retry="correct_request"))
            if path.startswith("/api/"):
                return self.send(404, fault("FIXTURE_ENDPOINT_NOT_IMPLEMENTED", "No fixture for this API; never forwarded upstream"))
            name = path.lstrip("/") or "index.html"
            if name not in ASSETS or not (ROOT/name).is_file():
                return self.send(404, fault("NOT_FOUND", "Not a public fixture asset"))
            if name == "sw.js":
                return self.send(200, b"self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.registration.unregister()));", "text/javascript; charset=utf-8")
            data = (ROOT/name).read_bytes()
            if name.endswith(".html"):
                banner = (f'<aside id="fixtureBanner" role="note" title="No services/robots connected; key: {FIXTURE_KEY}" style="position:fixed;top:0;left:0;right:0;z-index:100000;box-sizing:border-box;height:36px;line-height:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:#ffdf73;color:#151515;padding:8px;font:14px system-ui;text-align:center">'
                          f'LOCAL QA FIXTURE — {fixture.scenario} — no upstream — <a href="/__fixture__/">scenarios/key</a></aside>'
                          '<style>body{padding-top:38px!important}</style>')
                data = re.sub(br"(<body\b[^>]*>)", lambda m: m.group(1)+banner.encode(), data, count=1)
            kind = {".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json"}.get(Path(name).suffix, "application/octet-stream")
            return self.send(200, data, kind+"; charset=utf-8")

        def do_POST(self):
            path = urlsplit(self.path).path
            if path not in {"/api/v1/commands", "/__fixture__/reset"}:
                return self.send(404, fault("FIXTURE_ENDPOINT_NOT_IMPLEMENTED", "No proxy or mutation exists here"))
            if path == "/api/v1/commands":
                with fixture.lock:
                    fixture.command_post_count += 1
            if not self.authorized(fixture_control=path == "/__fixture__/reset"): return
            size = int(self.headers.get("Content-Length", "0"))
            if not 0 < size <= 16384:
                return self.send(413, fault("PAYLOAD_TOO_LARGE", "Fixture body size rejected"))
            try:
                body = json.loads(self.rfile.read(size))
                if not isinstance(body, dict): raise ValueError()
            except (ValueError, TypeError):
                return self.send(422, fault("INVALID_MESSAGE", "Fixture requires a JSON object"))
            if path == "/__fixture__/reset":
                if set(body) != {"scenario"} or body["scenario"] not in SCENARIOS:
                    return self.send(422, fault("INVALID_FIXTURE", "Explicit fixture reset requires only a named scenario"))
                fixture.reset(body["scenario"])
                return self.send(200, fixture.info())
            with fixture.lock:
                request_id = body.get("requestId")
                if isinstance(request_id, str):
                    fixture.command_posts_by_request_id[request_id] = fixture.command_posts_by_request_id.get(request_id, 0)+1
            status, value = fixture.submit(body)
            return self.send(status, value)
    return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", choices=SCENARIOS, default="accepted")
    parser.add_argument("--port", type=int, default=55231)
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Use an unprivileged local port")
    server = ThreadingHTTPServer(("127.0.0.1", args.port), handler_class(Fixture(args.scenario)))
    server.daemon_threads = True
    print(f"FIXTURE ONLY: http://127.0.0.1:{args.port}/ ; scenarios /__fixture__/ ; no upstream requests; Ctrl-C stops", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
