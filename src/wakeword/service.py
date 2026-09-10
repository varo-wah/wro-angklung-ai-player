"""Loopback-only WebSocket control. Disconnecting the owner releases the mic."""
import argparse
import uuid
from pathlib import Path

from aiohttp import web, WSMsgType
from .detector import OpenWakeWordDetector


class WakeSession:
    def __init__(self, detector, send):
        self.detector, self.send = detector, send
        self.session = uuid.uuid4().hex
        self.generation = 0
        self.state = "suspended"
        self.closed = False

    async def command(self, message):
        request_id = message.get("id")
        action = message.get("action")
        try:
            if action == "arm":
                if self.state != "listening":
                    self.generation += 1
                    generation = self.generation
                    self.state = "starting"

                    async def detected():
                        if self.closed or generation != self.generation or self.state != "listening":
                            return
                        self.state = "suspended"
                        await self.send({"type": "wake", "session": self.session, "generation": generation})

                    async def failed(error):
                        if self.closed or generation != self.generation:
                            return
                        self.state = "error"
                        await self.send({"type": "error", "error": error})

                    await self.detector.start(detected, failed)
                    self.state = "listening"
            elif action in ("suspend", "disable"):
                self.generation += 1
                self.state = "suspended"
                await self.detector.stop()
            else:
                raise ValueError("Unknown wake-word action.")
            await self.send({"type": "ack", "id": request_id, "state": self.state,
                             "session": self.session, "generation": self.generation})
        except Exception as exc:
            self.state = "error"
            self.generation += 1
            try:
                await self.detector.stop()
            except Exception:
                pass  # Return an error, never a successful handoff, when release failed.
            await self.send({"type": "ack", "id": request_id, "error": str(exc), "state": "error"})

    async def close(self):
        self.closed = True
        self.generation += 1
        self.state = "off"
        await self.detector.stop()


def create_app(detector, origins=None):
    app = web.Application()
    allowed = set(origins or ["http://localhost:3000", "http://127.0.0.1:3000"])
    owner = None

    async def health(request):
        error = detector.validate()
        return web.json_response({"engine": "openWakeWord", "phrase": "Hey Angklobot",
                                  "ready": error is None, "error": error,
                                  "state": owner.state if owner else "off"})

    async def websocket(request):
        nonlocal owner
        # Reject arbitrary websites and a second tab; never run two native streams.
        if request.headers.get("Origin") not in allowed:
            raise web.HTTPForbidden(text="Only the local Angklobot guest page may control this microphone.")
        if owner is not None:
            raise web.HTTPConflict(text="Wake-word mode is already owned by another guest tab.")
        ws = web.WebSocketResponse(heartbeat=5, max_msg_size=4096)
        session = WakeSession(detector, ws.send_json)
        owner = session
        try:
            await ws.prepare(request)
            error = detector.validate()
            await ws.send_json({"type": "hello", "session": session.session,
                                "ready": error is None, "error": error})
            async for message in ws:
                if message.type == WSMsgType.TEXT:
                    try:
                        data = message.json()
                        if not isinstance(data, dict):
                            raise ValueError("Expected a control object.")
                        await session.command(data)
                    except (ValueError, TypeError):
                        await ws.close(code=1008, message=b"Invalid control message")
                elif message.type == WSMsgType.ERROR:
                    break
        finally:
            try:
                await session.close()
            finally:
                if owner is session:
                    owner = None
        return ws

    async def shutdown(_app):
        if owner:
            await owner.close()

    app.router.add_get("/health", health)
    app.router.add_get("/ws", websocket)
    app.on_shutdown.append(shutdown)
    return app


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--features", type=Path, required=True)
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--device", help="Input device index or unique name substring (see --list-devices).")
    parser.add_argument("--threshold", type=float, default=0.5)
    parser.add_argument("--list-devices", action="store_true")
    args = parser.parse_args()
    if args.list_devices:
        import sounddevice as sd
        print(sd.query_devices())
        return
    if not 0 < args.threshold <= 1:
        parser.error("threshold must be in (0, 1]")
    device = int(args.device) if args.device and args.device.isdecimal() else args.device
    detector = OpenWakeWordDetector(args.model, args.features, device, args.threshold)
    print(detector.validate() or "Model files present. Inference will initialize on enable.", flush=True)
    print("Microphone stays closed until the Guest UI enables wake-word mode.", flush=True)
    web.run_app(create_app(detector), host="127.0.0.1", port=args.port, shutdown_timeout=3)


if __name__ == "__main__":
    main()
