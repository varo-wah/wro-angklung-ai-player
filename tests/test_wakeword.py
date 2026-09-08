"""Protocol/ownership tests use a fake detector, never a fake trained wake model."""
import asyncio
import unittest
from pathlib import Path

try:
    from aiohttp import ClientSession, WSServerHandshakeError, web
except ImportError:
    raise unittest.SkipTest("Run wake-word tests using .voice/wakeword-venv/bin/python after setup.")
from src.wakeword.detector import OpenWakeWordDetector
from src.wakeword.service import WakeSession, create_app


class FakeDetector:
    def __init__(self, error=None):
        self.error = error
        self.active = False
        self.starts = 0
        self.stops = 0
        self.detected = None

    def validate(self):
        return self.error

    async def start(self, detected, failed):
        if self.error:
            raise RuntimeError(self.error)
        assert not self.active
        self.active = True
        self.starts += 1
        self.detected = detected
        self.failed = failed

    async def stop(self):
        await asyncio.sleep(0)
        self.active = False
        self.stops += 1

    async def trigger(self):
        self.active = False  # Same contract as native detector: close, then signal.
        await self.detected()


class SessionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.detector = FakeDetector()
        self.messages = []

        async def send(message):
            if message.get("state") == "suspended" or message["type"] == "wake":
                self.assertFalse(self.detector.active)
            self.messages.append(message)

        self.session = WakeSession(self.detector, send)

    async def test_one_detection_then_explicit_rearm(self):
        await self.session.command({"id": 1, "action": "arm"})
        await self.session.command({"id": 2, "action": "arm"})
        self.assertEqual(self.detector.starts, 1)
        await self.detector.trigger()
        await self.detector.trigger()
        self.assertEqual(sum(m["type"] == "wake" for m in self.messages), 1)
        await self.session.command({"id": 3, "action": "suspend"})
        self.assertFalse(self.detector.active)
        await self.session.command({"id": 4, "action": "arm"})
        self.assertEqual(self.detector.starts, 2)

    async def test_stale_detection_after_suspend_and_rearm(self):
        await self.session.command({"id": 1, "action": "arm"})
        stale = self.detector.detected
        await self.session.command({"id": 2, "action": "suspend"})
        await self.session.command({"id": 3, "action": "arm"})
        await stale()
        self.assertFalse(any(m["type"] == "wake" for m in self.messages))

    async def test_disconnect_releases_microphone(self):
        await self.session.command({"id": 1, "action": "arm"})
        await self.session.close()
        self.assertFalse(self.detector.active)
        await self.detector.trigger()
        self.assertFalse(any(m["type"] == "wake" for m in self.messages))

    async def test_model_missing_never_starts_microphone(self):
        self.detector.error = "Model missing"
        await self.session.command({"id": 1, "action": "arm"})
        self.assertEqual(self.detector.starts, 0)
        self.assertEqual(self.messages[-1]["error"], "Model missing")

    async def test_error_stops_session(self):
        await self.session.command({"id": 1, "action": "arm"})
        self.detector.active = False
        await self.detector.failed("Permission revoked")
        self.assertEqual(self.session.state, "error")
        self.assertEqual(self.messages[-1]["error"], "Permission revoked")

    def test_missing_custom_model_is_not_replaced_with_builtin(self):
        detector = OpenWakeWordDetector(Path("/does-not-exist/hey_angklobot.onnx"), Path("/does-not-exist"))
        self.assertIn("model missing", detector.validate())
        self.assertIsNone(detector.model)


class ServerTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.detector = FakeDetector()
        self.runner = web.AppRunner(create_app(self.detector))
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.url = f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}"
        self.http = ClientSession()

    async def asyncTearDown(self):
        await self.http.close()
        await self.runner.cleanup()

    async def test_websocket_ownership_and_disconnect(self):
        headers = {"Origin": "http://localhost:3000"}
        async with self.http.ws_connect(self.url + "/ws", headers=headers) as ws:
            self.assertEqual((await ws.receive_json())["type"], "hello")
            self.assertFalse(self.detector.active)
            await ws.send_json({"id": 1, "action": "arm"})
            self.assertEqual((await ws.receive_json())["state"], "listening")
            with self.assertRaises(WSServerHandshakeError) as caught:
                await self.http.ws_connect(self.url + "/ws", headers=headers)
            self.assertEqual(caught.exception.status, 409)
            await self.detector.trigger()
            self.assertEqual((await ws.receive_json())["type"], "wake")
            await ws.send_json({"id": 2, "action": "arm"})
            await ws.receive_json()
        for _ in range(20):
            if not self.detector.active:
                break
            await asyncio.sleep(0.01)
        self.assertFalse(self.detector.active)

    async def test_origin_restriction(self):
        with self.assertRaises(WSServerHandshakeError) as caught:
            await self.http.ws_connect(self.url + "/ws", headers={"Origin": "https://example.com"})
        self.assertEqual(caught.exception.status, 403)
        self.assertFalse(self.detector.active)

    async def test_health_does_not_open_microphone(self):
        async with self.http.get(self.url + "/health") as response:
            self.assertTrue((await response.json())["ready"])
        self.assertFalse(self.detector.active)


if __name__ == "__main__":
    unittest.main()
