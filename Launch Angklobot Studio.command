#!/usr/bin/env python3
"""Double-click in Finder to open Studio and share this Mac session with phones."""
import fcntl
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import time
import urllib.error
import urllib.request

FRONTEND = Path(__file__).resolve().parent / "frontend"
ORIGIN = "http://127.0.0.1:3013"
PLAYER = ORIGIN + "/studio?output=robot"


def studio_ready():
    try:
        with urllib.request.urlopen(ORIGIN + "/studio", timeout=2) as response:
            return b"Angklobot Studio" in response.read()
    except (OSError, urllib.error.URLError):
        return False


def open_player():
    if os.environ.get("ANGKLOBOT_OPEN_BROWSER", "1") == "0":
        return
    subprocess.run(["open", "-a", "Google Chrome", PLAYER], check=True)


def main():
    os.chdir(FRONTEND)
    os.environ["PATH"] += ":/opt/homebrew/bin:/usr/local/bin"
    # Keep the lock file in place: the OS releases its lock even after a crash.
    cache = Path.home() / "Library/Caches/Angklobot Studio"
    cache.mkdir(parents=True, exist_ok=True)
    with (cache / "launcher.lock").open("a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            if studio_ready():
                open_player()
            else:
                print("Studio is starting in the first launcher window.")
            return
        children = []

        def start(args, **kwargs):
            child = subprocess.Popen(args, start_new_session=True, **kwargs)
            children.append(child)
            return child

        def interrupted(_signum, _frame):
            raise KeyboardInterrupt

        for sig in (signal.SIGTERM, signal.SIGHUP):
            signal.signal(sig, interrupted)
        try:
            server = None
            if not studio_ready():
                if not Path("node_modules/.bin/next").exists():
                    subprocess.run(["npm", "ci"], check=True)
                if not Path(".next-competition/BUILD_ID").exists():
                    subprocess.run(["npm", "run", "build:competition"], check=True)
                server = start(["node_modules/.bin/next", "start", "--hostname", "127.0.0.1", "--port", "3013"],
                               env={**os.environ, "ANGKLOBOT_DIST_DIR": ".next-competition", "ANGKLOBOT_WIRELESS_ENABLED": "1"})
                for _ in range(90):
                    if server.poll() is not None:
                        raise RuntimeError("Studio could not start on port 3013.")
                    if studio_ready():
                        break
                    time.sleep(1)
                else:
                    raise RuntimeError("Studio did not finish starting.")
            open_player()
            print("Studio is open. Keep this window open while playing. Press Control-C to stop.", flush=True)
            missing = [name for name in ("firebase", "cloudflared") if not shutil.which(name)]
            tunnel = None
            if missing:
                print("Local playback is ready. Phone access needs " + ", ".join(missing), flush=True)
            else:
                tunnel = start(["bash", "scripts/start-free-mobile-tunnel.sh"],
                               env={**os.environ, "ANGKLOBOT_LOCAL_ORIGIN": ORIGIN})
            while server is None or server.poll() is None:
                if tunnel and tunnel.poll() is not None:
                    print("Phone access stopped. Local Studio is still available. Restart the launcher to retry.", flush=True)
                    tunnel = None
                time.sleep(1)
            raise RuntimeError("Studio server stopped.")
        finally:
            for child in reversed(children):
                if child.poll() is None:
                    os.killpg(child.pid, signal.SIGTERM)
                    try:
                        child.wait(timeout=6)
                    except subprocess.TimeoutExpired:
                        os.killpg(child.pid, signal.SIGKILL)
                        child.wait()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except (OSError, RuntimeError, subprocess.CalledProcessError) as error:
        sys.exit(str(error))
