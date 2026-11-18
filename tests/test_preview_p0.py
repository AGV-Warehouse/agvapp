"""Socket-free QA fixture checks; these do not validate browser integration."""
import importlib.util
import io
import json
from pathlib import Path
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("preview_p0", Path(__file__).resolve().parents[1]/"tools/preview_p0.py")
preview = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(preview)


class MemorySocket:
    def __init__(self, raw):
        self.input, self.output = io.BytesIO(raw), bytearray()

    def makefile(self, *args, **kwargs):
        return self.input

    def sendall(self, data):
        self.output.extend(data)


class FixtureTests(unittest.TestCase):
    def setUp(self):
        self.fixture = preview.Fixture("accepted")
        self.handler = preview.handler_class(self.fixture)

    def request(self, path, body=None, key=None):
        payload = b"" if body is None else json.dumps(body).encode()
        method = "GET" if body is None else "POST"
        headers = (f"{method} {path} HTTP/1.0\r\nHost: 127.0.0.1:55231\r\n"
                   f"Content-Length: {len(payload)}\r\nContent-Type: application/json\r\n"
                   + (f"X-Fleet-Key: {key}\r\n" if key else "") + "\r\n")
        memory = MemorySocket(headers.encode()+payload)
        self.handler(memory, ("127.0.0.1", 1), SimpleNamespace(server_port=55231))
        header, response = bytes(memory.output).split(b"\r\n\r\n", 1)
        self.assertIn(b"X-AGV-Fixture: P0-1", header)
        self.assertIn(b"Cache-Control: no-store", header)
        return int(header.split(b" ")[1]), response

    def message(self, request_id="qa-intent"):
        return {"protocolVersion": "1.0", "requestId": request_id,
                "issuedAt": preview.timestamp(), "expiresAt": preview.timestamp(),
                "command": {"type": "create_order", "robotId": "AGV-01", "destination": "B"}}

    def test_named_scenarios_are_explicit_and_distinguish_receipt_from_order(self):
        for scene in preview.SCENARIOS:
            with self.subTest(scene=scene):
                status, html = self.request("/?fixture="+scene)
                self.assertEqual(status, 200)
                self.assertIn(b"LOCAL QA FIXTURE", html)
                status, raw = self.request("/api/v1/commands", self.message(scene), preview.FIXTURE_KEY)
                expected = 401 if scene == "unauth" else 409 if scene == "conflict" else 202 if scene in {"offline", "unknown", "dispatching"} else 200
                self.assertEqual(status, expected)
                value = json.loads(raw)
                if scene == "failed":
                    self.assertEqual(value["status"], "ACCEPTED")
                    self.assertEqual(value["result"]["order"]["state"], "FAILED")
                if scene == "rejected":
                    self.assertEqual(value["status"], "REJECTED")

    def test_original_envelope_is_idempotent_and_conflicting_content_is_not_replaced(self):
        body = self.message()
        status, first = self.request("/api/v1/commands", body, preview.FIXTURE_KEY)
        self.assertEqual(status, 200)
        self.assertEqual(self.request("/api/v1/commands", body, preview.FIXTURE_KEY)[1], first)
        conflict = {**body, "command": {"type": "pause", "robotId": "AGV-01"}}
        self.assertEqual(self.request("/api/v1/commands", conflict, preview.FIXTURE_KEY)[0], 409)
        self.assertEqual(self.request("/api/v1/commands/qa-intent", key=preview.FIXTURE_KEY)[1], first)

    def test_receipt_auth_and_missing_receipt_differ_from_missing_kernel_order(self):
        self.assertEqual(self.request("/api/v1/commands/not-found")[0], 401)
        status, raw = self.request("/api/v1/commands/not-found", key=preview.FIXTURE_KEY)
        self.assertEqual(status, 404)
        self.assertEqual(json.loads(raw)["error"]["code"], "REQUEST_NOT_FOUND")
        status, raw = self.request("/api/v1/orders/fleet-"+"0"*32)
        self.assertEqual(status, 404)
        self.assertEqual(json.loads(raw)["error"]["code"], "UPSTREAM_REJECTED")

    def test_empty_offline_and_private_resources_never_fall_back_to_live_services(self):
        self.fixture.reset("empty")
        self.assertEqual(json.loads(self.request("/api/v1/robots")[1])["robots"], [])
        self.fixture.reset("offline")
        state = json.loads(self.request("/api/v1/robots")[1])
        self.assertFalse(state["upstreamOnline"])
        self.assertEqual(state["upstreamAgeSeconds"], 60.)
        for path in ("/.env", "/tools/preview_p0.py", "/api/v1/unknown", "/../Fleetserver/runtime/commands.sqlite"):
            self.assertEqual(self.request(path)[0], 404)

    def test_editor_is_visibly_fixture_and_service_worker_is_disabled_only_here(self):
        self.assertIn(b"LOCAL QA FIXTURE", self.request("/editor.html")[1])
        self.assertIn(b"unregister", self.request("/sw.js")[1])
        self.assertNotIn("tools/preview_p0.py", preview.ASSETS)

    def test_sse_contains_only_fixture_snapshot_and_no_upstream_forwarding(self):
        with patch.object(preview.time, "sleep", return_value=None):
            status, raw = self.request("/api/v1/events")
        self.assertEqual(status, 200)
        self.assertTrue(raw.startswith(b"event: fleet\ndata: "))
        state = json.loads(raw.split(b"\n")[1][6:])
        self.assertIn("FIXTURE", state["freshnessSource"])

    def test_same_scenario_refresh_keeps_unknown_receipt_and_counts_real_posts_only(self):
        self.fixture.reset("unknown")
        initial = self.fixture.info()
        self.assertEqual(initial["commandPostCount"], 0)  # Seeding is not HTTP traffic.
        body = self.message("browser-unknown")
        self.assertEqual(self.request("/api/v1/commands", body, preview.FIXTURE_KEY)[0], 202)
        self.assertEqual(self.request("/?fixture=unknown")[0], 200)
        self.assertEqual(self.request("/api/v1/commands/browser-unknown", key=preview.FIXTURE_KEY)[0], 200)
        info = json.loads(self.request("/__fixture__/info")[1])
        self.assertEqual(info["generation"], initial["generation"])
        self.assertEqual(info["commandPostCount"], 1)
        self.assertEqual(info["commandPostsByRequestId"], {"browser-unknown": 1})
        self.request("/api/v1/commands", body, preview.FIXTURE_KEY)
        info = self.fixture.info()
        self.assertEqual(info["commandPostCount"], 2)  # Distinguishes retries from one side effect.
        self.assertEqual(len(info["requestIds"]), 2)  # Seed + the single stored user intent.

    def test_explicit_fixture_reset_requires_key_and_does_not_touch_product_endpoints(self):
        body = self.message()
        self.request("/api/v1/commands", body, preview.FIXTURE_KEY)
        self.assertEqual(self.request("/__fixture__/reset", {"scenario": "unknown"})[0], 401)
        self.assertEqual(self.fixture.info()["commandPostCount"], 1)
        status, raw = self.request("/__fixture__/reset", {"scenario": "unknown"}, preview.FIXTURE_KEY)
        self.assertEqual(status, 200)
        self.assertEqual(json.loads(raw)["commandPostCount"], 0)
        self.assertNotIn("qa-intent", json.loads(raw)["requestIds"])
        self.assertEqual(self.request("/__fixture__/reset", {"scenario": "unknown", "target": "production"}, preview.FIXTURE_KEY)[0], 422)
        self.assertEqual(self.request("/api/v1/reset", {"scenario": "unknown"}, preview.FIXTURE_KEY)[0], 404)

if __name__ == "__main__":
    unittest.main()
