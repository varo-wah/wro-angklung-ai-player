# Studio conducting

Launch `Launch Angklobot Studio.command`, then open http://127.0.0.1:3013/studio/conduct?output=robot on the Mac. To suppress an external browser, launch with `ANGKLOBOT_OPEN_BROWSER=0`.

1. Enable the Mac controller and connect Arduino USB in Studio.
2. Select Conduct, keep the default YOLO + hand/arm detector, and start the camera.
3. Press Enable robot conducting. Hold a sign steady; release to neutral before repeating that note.
4. Stop conducting or press Escape to disarm. Leaving Conduct, hiding the tab, and detector failure also stop output.

The existing trained detector is loaded from sibling `angklobot-conducting/Conducting Vision`, including its `.venv`, `hybrid_landmarks.py`, landmark assets and `runs/kodaly-yolov8n-v3/weights/best.pt`. Override `ANGKLOBOT_VISION_DIR` for another installation. These model assets are not bundled into the website. The launcher starts `scripts/conduct_server.py` on loopback port 8766. Camera frames pass through the local Studio server; they are not saved. Hosted/tunnel origins cannot submit frames.

Supported signs cover C4–C5. Robot notes are finite 300 ms calibrated NOTE commands, scaled by Studio volume, rather than manual raw motor power. A held sign triggers once; neutral release allows another trigger. Personal browser calibration remains an optional sound/USB detector alternative.

YOLO conducting currently requires the camera and Arduino USB host on the Mac. Phone song controls remain available through the existing paired session; phone-camera conducting and ESP32 conducting are not implemented. Static Firebase hosting alone cannot run the Python model.

Validation includes controller tests, a simulated browser camera/USB test, and real-model blank-frame inference. Live gesture accuracy and powered rack behavior require a physical trial.
