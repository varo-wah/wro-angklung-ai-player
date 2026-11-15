"""Loopback-only, bounded JPEG inference for Studio. Never opens a camera or serial port."""
import json
import os
from pathlib import Path
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

ROOT = Path(os.environ.get("ANGKLOBOT_VISION_DIR", str(Path(__file__).resolve().parents[2] / "angklobot-conducting" / "Conducting Vision")))
sys.path.insert(0, str(ROOT))
LOCK = threading.Lock()
model = hybrid = None
NOTES = {"Low Do": ("Do", "C4"), "High Do": ("Do′", "C5"), "Re": ("Re", "D4"),
         "Mi": ("Mi", "E4"), "Fa": ("Fa", "F4"), "Sol": ("Sol", "G4"),
         "La": ("La", "A4"), "Ti": ("Ti", "B4")}


def infer(payload):
    global model, hybrid
    import cv2
    import numpy as np
    import torch
    if model is None:
        from ultralytics import YOLO
        from hybrid_landmarks import HybridRecognizer
        torch.set_num_threads(2)
        model = YOLO(str(ROOT / "runs/kodaly-yolov8n-v3/weights/best.pt"))
        hybrid = HybridRecognizer()
    frame = cv2.imdecode(np.frombuffer(payload, dtype=np.uint8), cv2.IMREAD_COLOR)
    if frame is None or frame.shape[0] > 720 or frame.shape[1] > 960:
        raise ValueError("Use a JPEG frame up to 960 by 720.")
    start = time.monotonic()
    result = model.predict(frame, conf=0.5, imgsz=512, device="cpu", verbose=False)[0]
    label, hand = hybrid.recognize(frame, result)
    match = NOTES.get(label.split(" | ")[0])
    return {"recognition": {"sign": match[0], "note": match[1], "distance": 0} if match else None,
            "landmarks": [[{"x": float(p.x), "y": float(p.y), "z": float(p.z)} for p in hand]] if hand else [],
            "inferenceMs": (time.monotonic()-start)*1000, "message": label}


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, value):
        payload = json.dumps(value).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        self.reply(200, {"available": (ROOT / "runs/kodaly-yolov8n-v3/weights/best.pt").is_file()})

    def do_POST(self):
        if self.path != "/frame" or self.headers.get("Content-Type") != "image/jpeg":
            return self.reply(400, {"error": "Expected JPEG frame."})
        try:
            size = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            size = 0
        if not 0 < size <= 300000:
            return self.reply(413, {"error": "Invalid frame size."})
        if not LOCK.acquire(blocking=False):
            return self.reply(429, {"error": "Detector busy. Close other conducting tabs."})
        try:
            self.reply(200, infer(self.rfile.read(size)))
        except Exception as error:
            print(f"Inference failed: {error}", flush=True)
            self.reply(503, {"error": "Local YOLO detector failed. Check the vision installation."})
        finally:
            LOCK.release()

    def log_message(self, *_):
        pass


if __name__ == "__main__":
    print("Studio YOLO hybrid listening on 127.0.0.1:8766", flush=True)
    ThreadingHTTPServer(("127.0.0.1", 8766), Handler).serve_forever()
