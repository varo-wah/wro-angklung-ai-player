"""Numerical/format tests only. They do not train or install a speech classifier."""
import importlib.util
from pathlib import Path
import pytest

np = pytest.importorskip("numpy")
ort = pytest.importorskip("onnxruntime")
pytest.importorskip("onnx")

spec = importlib.util.spec_from_file_location("local_training", Path(__file__).parents[1] / "scripts/train_wakeword_local.py")
training = importlib.util.module_from_spec(spec)
spec.loader.exec_module(training)


def test_empty_dataset_cannot_produce_model(tmp_path):
    with pytest.raises(ValueError, match="need at least"):
        training.dataset_files(tmp_path)
    assert not list(tmp_path.glob("*.onnx"))


def test_export_head_matches_mlp_math_and_openwakeword_shape(tmp_path):
    class Parameters:
        coefs_ = [np.full((1536, 2), 0.001, dtype=np.float32), np.array([[0.2], [0.3]], dtype=np.float32)]
        intercepts_ = [np.zeros(2, dtype=np.float32), np.array([-0.1], dtype=np.float32)]
    path = tmp_path / "shape_test.onnx"
    training.export_head(Parameters(), path)
    model = ort.InferenceSession(str(path), providers=["CPUExecutionProvider"])
    features = np.ones((1, 16, 96), dtype=np.float32)
    prediction = model.run(None, {"features": features})[0]
    expected = 1 / (1 + np.exp(-(1.536 * 0.5 - 0.1)))
    assert model.get_inputs()[0].shape[1:] == [16, 96]
    assert prediction.shape == (1, 1)
    assert float(prediction[0, 0]) == pytest.approx(expected, abs=1e-5)
