"""Train a CPU-only experimental openWakeWord head from labeled LOCAL WAV files.

No data is recorded, generated, downloaded, or uploaded by this script.
The exported candidate is not installed into the running detector automatically.
"""
import argparse
import hashlib
import json
from pathlib import Path
import wave

import numpy as np


def read_clip(path):
    with wave.open(str(path), 'rb') as wav:
        if (wav.getnchannels(), wav.getsampwidth(), wav.getframerate()) != (1, 2, 16000):
            raise ValueError(f'{path}: expected mono PCM16 WAV at 16000 Hz')
        pcm = np.frombuffer(wav.readframes(wav.getnframes()), dtype='<i2')
    if not 8000 <= len(pcm) <= 48000:
        raise ValueError(f'{path}: use 0.5–3 second clips; do not truncate a phrase')
    # The phrase must end near the end of a clip. Pad BEFORE it to preserve that alignment.
    return np.pad(pcm, (48000 - len(pcm), 0))


def dataset_files(root):
    groups = {}
    seen = {}
    for split in ('train', 'test'):
        for label in ('positive', 'negative'):
            paths = sorted((root / split / label).glob('*.wav'))
            minimum = 20 if split == 'train' else 5
            if len(paths) < minimum:
                raise ValueError(f'{root / split / label}: need at least {minimum} labeled WAVs (only a smoke-test minimum)')
            for path in paths:
                digest = hashlib.sha256(path.read_bytes()).hexdigest()
                if digest in seen:
                    raise ValueError(f'Duplicate clip: {path} and {seen[digest]}; keep evaluation independent')
                seen[digest] = path
            groups[(split, label)] = paths
    return groups


def export_head(classifier, output):
    """Export the fitted MLP as [batch,16,96] -> [batch,1], openWakeWord's ABI."""
    import onnx
    from onnx import TensorProto, helper, numpy_helper
    nodes = [helper.make_node('Flatten', ['features'], ['flat'], axis=1)]
    initializers = []
    previous = 'flat'
    for i, (weights, bias) in enumerate(zip(classifier.coefs_, classifier.intercepts_)):
        initializers.extend([numpy_helper.from_array(weights.astype(np.float32), f'w{i}'),
                             numpy_helper.from_array(bias.astype(np.float32), f'b{i}')])
        nodes.extend([helper.make_node('MatMul', [previous, f'w{i}'], [f'mat{i}']),
                      helper.make_node('Add', [f'mat{i}', f'b{i}'], [f'add{i}'])])
        final = i == len(classifier.coefs_) - 1
        previous = 'probability' if final else f'relu{i}'
        nodes.append(helper.make_node('Sigmoid' if final else 'Relu', [f'add{i}'], [previous]))
    graph = helper.make_graph(nodes, 'hey_angklobot',
        [helper.make_tensor_value_info('features', TensorProto.FLOAT, [None, 16, 96])],
        [helper.make_tensor_value_info('probability', TensorProto.FLOAT, [None, 1])], initializers)
    model = helper.make_model(graph, opset_imports=[helper.make_opsetid('', 13)])
    model.ir_version = 8
    onnx.checker.check_model(model)
    onnx.save(model, str(output))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--dataset', type=Path, default=Path('.voice/wakeword-training/data'))
    parser.add_argument('--features', type=Path, default=Path('.voice/wakeword-models'))
    parser.add_argument('--output', type=Path, default=Path('.voice/wakeword-training/hey_angklobot.candidate.onnx'))
    parser.add_argument('--prepare', action='store_true', help='Create empty dataset directories; train nothing')
    parser.add_argument('--check', action='store_true', help='Validate data without training')
    args = parser.parse_args()
    if args.prepare:
        for split in ('train', 'test'):
            for label in ('positive', 'negative'):
                (args.dataset / split / label).mkdir(parents=True, exist_ok=True)
        print(f'Empty dataset directories prepared at {args.dataset}. No model exists yet.')
        return
    try:
        groups = dataset_files(args.dataset)
        for paths in groups.values():
            for path in paths:
                read_clip(path)
    except ValueError as error:
        parser.exit(1, f'{error}\nSee docs/wakeword-macos.md for collection and training requirements.\n')
    if args.check:
        print('Dataset format/count checks passed. Phrase labels and speaker independence require human review.')
        return
    if args.output.exists():
        parser.exit(1, 'Output exists. Choose a new --output path; do not overwrite reviewed models.\n')
    from openwakeword.utils import AudioFeatures
    from sklearn.neural_network import MLPClassifier
    from sklearn.metrics import confusion_matrix
    import onnxruntime as ort
    features = AudioFeatures(inference_framework='onnx',
        melspec_model_path=str(args.features / 'melspectrogram.onnx'),
        embedding_model_path=str(args.features / 'embedding_model.onnx'))
    arrays = {}
    for (split, label), paths in groups.items():
        batches = []
        for start in range(0, len(paths), 16):
            audio = np.stack([read_clip(path) for path in paths[start:start + 16]])
            batches.append(features.embed_clips(audio, batch_size=16, ncpu=1)[:, -16:, :])
        arrays[(split, label)] = np.concatenate(batches).astype(np.float32)
    def xy(split):
        positive, negative = arrays[(split, 'positive')], arrays[(split, 'negative')]
        return np.concatenate([positive, negative]), np.concatenate([np.ones(len(positive)), np.zeros(len(negative))])
    x_train, y_train = xy('train')
    x_test, y_test = xy('test')
    classifier = MLPClassifier(hidden_layer_sizes=(64, 32), random_state=42,
                               max_iter=200, early_stopping=True, validation_fraction=0.2)
    classifier.fit(x_train.reshape(len(x_train), -1), y_train)
    args.output.parent.mkdir(parents=True, exist_ok=True)
    export_head(classifier, args.output)
    session = ort.InferenceSession(str(args.output), providers=['CPUExecutionProvider'])
    scores = session.run(None, {'features': x_test})[0][:, 0]
    np.testing.assert_allclose(scores, classifier.predict_proba(x_test.reshape(len(x_test), -1))[:, 1], atol=1e-5)
    tn, fp, fn, tp = confusion_matrix(y_test, scores >= 0.5, labels=[0, 1]).ravel()
    report = {'phrase': 'Hey Angklobot', 'experimental': True, 'threshold': 0.5,
              'train_clips': len(y_train), 'test_clips': len(y_test),
              'true_positive': int(tp), 'false_negative': int(fn),
              'false_positive': int(fp), 'true_negative': int(tn),
              'note': 'Clip metrics do not establish streaming false alarms per hour. Validate on the actual Mac before installation.',
              'model_sha256': hashlib.sha256(args.output.read_bytes()).hexdigest()}
    args.output.with_suffix('.json').write_text(json.dumps(report, indent=2) + '\n')
    print(json.dumps(report, indent=2))
    print(f'Candidate only: {args.output}. Not installed into the wake-word service.')


if __name__ == '__main__':
    main()
