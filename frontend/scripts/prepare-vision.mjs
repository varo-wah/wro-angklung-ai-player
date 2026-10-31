import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = path.join(root, 'node_modules/@mediapipe/tasks-vision');
const output = path.join(root, 'public/vision');
await mkdir(path.join(output, 'wasm'), { recursive: true });
await copyFile(path.join(source, 'vision_bundle.js'), path.join(output, 'vision_bundle.js'));
for (const variant of ['internal', 'nosimd_internal', 'module_internal']) {
  for (const extension of ['js', 'wasm']) {
    const name = `vision_wasm_${variant}.${extension}`;
    await copyFile(path.join(source, 'wasm', name), path.join(output, 'wasm', name));
  }
}
const url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const expected = 'fbc2a30080c3c557093b5ddfc334698132eb341044ccee322ccf8bcf3607cde1';
const destination = path.join(output, 'hand_landmarker.task');
let bytes;
try { bytes = await readFile(destination); } catch { /* First install. */ }
const digest = data => createHash('sha256').update(data).digest('hex');
if (!bytes || digest(bytes) !== expected) {
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw new Error(`Hand model download failed (${response.status}).`);
  bytes = Buffer.from(await response.arrayBuffer());
  if (digest(bytes) !== expected) throw new Error('Hand model checksum mismatch; refusing changed model.');
  await writeFile(destination, bytes);
}
console.log('Local vision runtime and verified hand model are ready.');
