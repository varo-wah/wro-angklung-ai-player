"""Download only upstream's shared ONNX features, never substitute a wake phrase."""
import argparse
from pathlib import Path
from urllib.request import urlopen

BASE = "https://github.com/dscripka/openWakeWord/releases/download/v0.5.1/"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=True)
    import onnxruntime as ort
    for name in ("melspectrogram.onnx", "embedding_model.onnx"):
        target = args.output / name
        if not target.exists():
            temporary = target.with_suffix(".download")
            try:
                with urlopen(BASE + name, timeout=120) as response, temporary.open("wb") as output:
                    while chunk := response.read(1024 * 1024):
                        output.write(chunk)
                ort.InferenceSession(str(temporary), providers=["CPUExecutionProvider"])
                temporary.replace(target)
            finally:
                temporary.unlink(missing_ok=True)
        ort.InferenceSession(str(target), providers=["CPUExecutionProvider"])
        print(f"Verified shared feature model: {target}")
    print("No Hey Angklobot classifier was downloaded or created.")


if __name__ == "__main__":
    main()
