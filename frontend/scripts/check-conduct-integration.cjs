// Isolated fake camera and serial rack: never opens physical hardware.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright-core');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true,
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  try {
    const page = await browser.newPage();
    await page.addInitScript(() => {
      let reader;
      window.serialLines = [];
      const port = { open: async () => {}, close: async () => {},
        readable: new ReadableStream({ start(c) { reader = c; } }),
        writable: new WritableStream({ write(data) {
          const line = new TextDecoder().decode(data).trim(); window.serialLines.push(line);
          const reply = line === 'HELLO,1' ? 'READY,1,ACTIVE' : line === 'ARM' ? 'ACK,ARM'
            : line === 'ALL_OFF' ? 'ACK,ALL_OFF' : line.startsWith('NOTE,') ? 'ACK,NOTE,' + line.split(',')[1] : '';
          if (reply) reader.enqueue(new TextEncoder().encode(reply + '\n'));
        } }) };
      Object.defineProperty(navigator, 'serial', { value: { getPorts: async () => [], requestPort: async () => port } });
    });
    let frames = 0, neutral = false, fail = false;
    await page.route('**/api/conduct/frame', route => {
      frames++;
      return route.fulfill({ status: fail ? 503 : 200, contentType: 'application/json', body: JSON.stringify(
        fail ? { error: 'Test detector disconnected' } :
        { landmarks: [], recognition: neutral ? null : { sign: 'Do', note: 'C4', distance: 0 }, inferenceMs: 10, message: 'Low Do | hand + arm' }) });
    });
    const origin = process.env.STUDIO_TEST_ORIGIN || 'http://127.0.0.1:3193';
    await page.goto(origin + '/studio/conduct?output=robot');
    await page.getByRole('button', { name: 'Enable Mac controller' }).click();
    await page.getByRole('button', { name: 'Connect Arduino USB' }).click();
    await page.getByText('Angklobot connected', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Start camera', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('video')?.readyState >= 2);
    await page.getByRole('button', { name: 'Enable robot conducting' }).click();
    await page.waitForFunction(() => window.serialLines.some(line => line.startsWith('NOTE,3,300,600')));
    await page.waitForTimeout(800);
    if (await page.evaluate(() => window.serialLines.filter(line => line.startsWith('NOTE,')).length) !== 1)
      throw new Error('Held sign retriggered, or camera reset with heartbeat');
    neutral = true;
    await page.waitForTimeout(400);
    neutral = false;
    await page.waitForFunction(() => window.serialLines.filter(line => line.startsWith('NOTE,')).length === 2);
    fail = true;
    await page.getByRole('alert').filter({ hasText: 'Test detector disconnected' }).waitFor();
    await page.waitForFunction(() => window.serialLines.at(-1) === 'DISARM');
    if (frames < 5) throw new Error('Camera frame flow not exercised');
    await page.getByRole('button', { name: 'Disable remote control' }).click();
    console.log('PASS: camera to shared USB notes; held-sign gate, neutral repeat and detector-loss disarm.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
