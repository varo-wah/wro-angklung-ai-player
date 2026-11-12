// Run against a separate local test server. Never connects to hardware.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright-core");
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const url = (process.env.STUDIO_TEST_ORIGIN || "http://127.0.0.1:3187") + "/studio";
    const host = await browser.newPage();
    const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await host.addInitScript(() => {
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
    await host.getByRole("button",{name:"Robot & phone connection"}).click();
    await host.getByRole("button", {name:"Enable Mac controller"}).click();
    {
      await host.getByRole("region",{name:"Robot connection"}).getByRole("button",{name:"Connect Arduino USB"}).click();
      await host.getByText("Angklobot connected",{exact:true}).waitFor();
    }
    const code = await host.locator("strong.tracking-widest").innerText();
    await phone.goto(url);
    await phone.getByRole("button",{name:"Robot & phone connection"}).click();
    await phone.getByLabel("Mac pairing code").fill(code);
    await phone.getByRole("button",{name:"Pair device"}).click();
    await phone.getByText("Paired remote control").waitFor();
    await phone.waitForFunction(() => !document.querySelector('button[aria-label="Play on robot"]')?.disabled);
    await phone.getByRole("button",{name:"Add Bengawan Solo to queue",exact:true}).click();
    await host.getByRole("button",{name:"Play queued Bengawan Solo",exact:true}).waitFor();
    await phone.getByRole("button",{name:"Queue repeat: off"}).click();
    await host.getByRole("button",{name:"Queue repeat: all"}).waitFor();
    await phone.getByRole("button",{name:"Play queued Bengawan Solo",exact:true}).click();
    await host.getByText("Bengawan Solo · playing",{exact:true}).waitFor();
    await host.waitForFunction(() => window.serialLines.includes("ARM") && window.serialLines.some(s => s.startsWith("NOTE,")));
    await phone.getByRole("button",{name:"Pause",exact:true}).first().click();
    await host.getByText("Bengawan Solo · paused",{exact:true}).waitFor();
    await host.getByRole("button",{name:"Play on robot",exact:true}).click();
    await phone.getByText("Bengawan Solo · playing",{exact:true}).waitFor();
    await phone.getByRole("button",{name:"Stop robot",exact:true}).click();
    await host.getByText("Bengawan Solo · stopped",{exact:true}).waitFor();
    await host.waitForFunction(() => window.serialLines.lastIndexOf("DISARM") > window.serialLines.findLastIndex(s => s.startsWith("NOTE,")));
    await host.getByRole("button",{name:"Disable remote control"}).click();
    console.log("PASS: separate clients paired, selected, played, paused, stopped and released one Mac session.");
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode=1; });
