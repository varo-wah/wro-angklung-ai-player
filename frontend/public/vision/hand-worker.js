/* Classic worker: inference never blocks Studio's controls or song scheduler. */
let detector;
self.onmessage = async ({ data }) => {
  try {
    if (data.type === 'init') {
      importScripts('/vision/vision_bundle.js');
      const files = await Vision.FilesetResolver.forVisionTasks('/vision/wasm');
      detector = await Vision.HandLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: '/vision/hand_landmarker.task', delegate: 'CPU' },
        runningMode: 'VIDEO', numHands: 2,
        minHandDetectionConfidence: 0.7, minHandPresenceConfidence: 0.7,
        minTrackingConfidence: 0.7,
      });
      self.postMessage({ type: 'ready' });
    } else if (data.type === 'frame') {
      const started = performance.now();
      try {
        const result = detector.detectForVideo(data.bitmap, data.timestamp);
        self.postMessage({ type: 'result', timestamp: data.timestamp,
          inferenceMs: performance.now() - started, landmarks: result.landmarks });
      } finally { data.bitmap.close(); }
    }
  } catch (error) {
    self.postMessage({ type: 'error', message: error instanceof Error ? error.message : 'Hand tracking failed.' });
  }
};
