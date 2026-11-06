// Run against a separate local test server. Never connects to hardware.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const url = (process.env.STUDIO_TEST_ORIGIN || "http://127.0.0.1:3187") + "/studio/device";
    const host = await browser.newPage();
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const serial = process.env.STUDIO_TEST_SERIAL === "1";
    if (serial) await host.addInitScript(() => {
      let reader;
      window.serialLines = [];
      const port = {
        open: async () => {}, close: async () => {},
        readable: new ReadableStream({ start(c) { reader = c; } }),
        writable: new WritableStream({ write(data) {
          const line = new TextDecoder().decode(data).trim();
          window.serialLines.push(line);
          if (line === "HELLO,1") reader.enqueue(new TextEncoder().encode("READY,1,ACTIVE\n"));
        } }),
      };
      Object.defineProperty(navigator, "serial", {value: {getPorts: async () => [], requestPort: async () => port}});
    });
    await host.goto(url);
    await host.getByRole("button", {name:"Enable Mac controller"}).click();
    if (serial) {
      await host.getByRole("region",{name:"Robot connection"}).getByRole("button",{name:"Connect Arduino USB"}).click();
      await host.getByText("Angklobot connected",{exact:true}).waitFor();
    } else await host.getByLabel("Send playback to physical angklung").uncheck();
    const code = await host.locator("strong.tracking-widest").innerText();
    await phone.goto(url);
    await phone.getByLabel("Mac pairing code").fill(code);
    await phone.getByRole("button",{name:"Pair device"}).click();
    await phone.getByRole("button",{name:/Browse/}).click();
    await phone.getByLabel("Search songs").fill("Bengawan Solo");
    await phone.getByRole("dialog").getByRole("button",{name:/Bengawan Solo/}).click();
    await phone.getByRole("button",{name:serial ? "Play + Arduino" : "Play Simulation"}).click();
    await host.getByText("Bengawan Solo · playing",{exact:true}).first().waitFor();
    if (serial) await host.waitForFunction(() => window.serialLines.includes("ARM") && window.serialLines.some(s => s.startsWith("NOTE,")));
    await phone.getByRole("button",{name:"Pause",exact:true}).click();
    await host.getByText("Bengawan Solo · paused",{exact:true}).first().waitFor();
    await phone.getByRole("button",{name:"Stop robot",exact:true}).click();
    await host.getByText("Bengawan Solo · stopped",{exact:true}).first().waitFor();
    if (serial) await host.waitForFunction(() => window.serialLines.lastIndexOf("DISARM") > window.serialLines.findIndex(s => s.startsWith("NOTE,")));
    await host.getByRole("button",{name:"Disable remote control"}).click();
    console.log("PASS: separate clients paired, selected, played, paused, stopped and released one Mac session.");
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode=1; });
