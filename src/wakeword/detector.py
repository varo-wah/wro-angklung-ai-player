"""One native microphone owner. Every stop joins capture before acknowledging."""
import asyncio
import time
from pathlib import Path


class OpenWakeWordDetector:
    def __init__(self, model_path: Path, features: Path, device=None, threshold=0.5):
        self.model_path, self.features = model_path, features
        self.device, self.threshold = device, threshold
        self.model = None
        self.task = None
        self.stream = None
        self.stopping = False
        self.error = None

    def validate(self):
        if not self.model_path.is_file():
            return "Hey Angklobot model missing. Install a trained hey_angklobot.onnx; see docs/wakeword-macos.md."
        if self.model_path.suffix != ".onnx":
            return "The Mac detector requires an ONNX wake-word model."
        for name in ("melspectrogram.onnx", "embedding_model.onnx"):
            if not (self.features / name).is_file():
                return "Shared feature models missing. Run scripts/setup_wakeword_macos.sh."
        return self.error

    def _load_model(self):
        from openwakeword.model import Model
        self.model = Model(
            wakeword_models=[str(self.model_path)], inference_framework="onnx",
            melspec_model_path=str(self.features / "melspectrogram.onnx"),
            embedding_model_path=str(self.features / "embedding_model.onnx"),
        )

    async def start(self, on_detected, on_error):
        if self.task and not self.task.done():
            return
        if error := self.validate():
            raise RuntimeError(error)
        if self.model is None:
            await asyncio.to_thread(self._load_model)
        self.model.reset()
        self.stopping = False
        # No native audio is opened at process startup; only an explicit arm does this.
        import sounddevice as sd
        stream = sd.RawInputStream(samplerate=16000, blocksize=1280, channels=1,
                                   dtype="int16", device=self.device)
        try:
            await asyncio.to_thread(stream.start)
        except BaseException:
            stream.close()
            raise
        self.stream = stream
        self.task = asyncio.create_task(self._capture(stream, on_detected, on_error))

    async def _capture(self, stream, on_detected, on_error):
        import numpy as np
        detected, failure = False, None
        started = time.monotonic()
        consecutive = 0
        try:
            while not self.stopping:
                audio, overflow = await asyncio.to_thread(stream.read, 1280)
                if self.stopping:
                    break
                if overflow or not stream.active:
                    raise RuntimeError("Wake microphone interrupted or overflowed. Select an available input device and enable again.")
                scores = await asyncio.to_thread(self.model.predict, np.frombuffer(audio, dtype=np.int16))
                score = max(float(value) for value in scores.values())
                # Ignore initial transients and require two consecutive 80 ms frames.
                consecutive = consecutive + 1 if score >= self.threshold and time.monotonic() - started >= 0.4 else 0
                if consecutive >= 2:
                    detected = True
                    break
        except Exception as exc:
            failure = f"Wake microphone/inference failed: {exc}"
        finally:
            # Ownership ends before a wake event can cause the browser to open its mic.
            try:
                await asyncio.to_thread(stream.stop)
            except Exception as exc:
                failure = failure or f"Could not stop wake microphone: {exc}"
            finally:
                try:
                    await asyncio.to_thread(stream.close)
                except Exception as exc:
                    failure = failure or f"Could not close wake microphone: {exc}"
                    self.error = f"Wake microphone release failed; restart the service: {exc}"
                self.stream = None
        if failure and not self.stopping:
            await on_error(failure)
        elif detected and not self.stopping:
            await on_detected()

    async def stop(self):
        self.stopping = True
        task = self.task
        if task and task is not asyncio.current_task():
            # Abort unblocks a device that stopped delivering frames (e.g. unplugged).
            if self.stream:
                try:
                    await asyncio.to_thread(self.stream.abort)
                except Exception:
                    pass  # Device may have disappeared; capture's finally still closes it.
            await task
        self.task = None
        if self.error:
            raise RuntimeError(self.error)
