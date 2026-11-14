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
          if (line.startsWith("SWEEP,")) reader.enqueue(new TextEncoder().encode("ACK,SWEEP,DONE\n"));
          if (line === "ARM") reader.enqueue(new TextEncoder().encode("ACK,ARM\n"));
          if (line === "ALL_OFF") reader.enqueue(new TextEncoder().encode("ACK,ALL_OFF\n"));
          if (line.startsWith("MANUAL,")) reader.enqueue(new TextEncoder().encode("ACK,MANUAL\n"));
          if (line === "MANUAL_CAPS") reader.enqueue(new TextEncoder().encode("CAPS,MANUAL_RAW,100,250\n"));
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
    await phone.getByLabel("Playlist name").fill("Concert");
    await phone.getByRole("button",{name:"Save queue"}).click();
    await host.getByRole("button",{name:"Play playlist Concert"}).waitFor();
    await phone.getByRole("button",{name:"Play playlist Concert"}).click();
    await host.waitForFunction(() => window.serialLines.some(line => line.startsWith("NOTE,")));
    await phone.getByRole("slider",{name:"Player robot volume"}).press("Home");
    await host.waitForFunction(() => document.querySelector('input[aria-label="Player robot volume"]').value === "0");
    await phone.waitForFunction(() => document.querySelector('input[aria-label="Player robot volume"]').value === "0");
    await phone.getByRole("slider",{name:"Player robot volume"}).press("End");
    await host.waitForFunction(() => document.querySelector('input[aria-label="Player robot volume"]').value === "100");
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
    await host.getByRole("link",{name:"Preferences"}).click();
    await phone.getByRole("link",{name:/Settings|Preferences/}).click();
    await phone.locator("#studio-volume").selectOption("30");
    await host.waitForFunction(() => document.querySelector("#studio-volume")?.value === "30");
    if (await host.getByRole("button",{name:"Run rack sweep"}).isVisible()) throw new Error("Sweep should start collapsed");
    await host.getByText("Advanced rack controls",{exact:true}).click();
    await host.getByRole("button",{name:"Run rack sweep"}).click();
    await host.getByText("Sweep complete.",{exact:true}).waitFor();
    await host.waitForFunction(() => window.serialLines.includes("SWEEP,30,150,50") && window.serialLines.at(-1) === "DISARM");

    await host.getByRole("link", { name: "Manual notes", exact: true }).click();
    const note = host.getByRole("button", { name: "Hold G3, motor 1", exact: true });
    await note.waitFor();
    await note.focus();
    const beforeHold = await host.evaluate(() => window.serialLines.length);
    await host.keyboard.down("Space");
    await host.waitForFunction(start => window.serialLines.slice(start).filter(line => line === "MANUAL,0,30").length >= 2, beforeHold);
    await host.keyboard.up("Space");
    await host.waitForFunction(() => window.serialLines.at(-1) === "DISARM");
    const released = await host.evaluate(() => window.serialLines.length);
    await host.waitForTimeout(400);
    if (await host.evaluate(() => window.serialLines.length) !== released) throw new Error("Notes continued after release");
    await host.getByRole("slider", { name: "Manual motor power" }).fill("100");
    await host.bringToFront();
    await note.scrollIntoViewIfNeeded();
    const bounds = await note.boundingBox();
    await host.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
    await host.mouse.down();
    await host.waitForFunction(start => window.serialLines.slice(start).some(line => line === "MANUAL,0,100"), released);
    await host.mouse.move(1, 1);
    await host.mouse.up();
    await host.waitForFunction(() => window.serialLines.at(-1) === "DISARM");
    await host.getByRole("button",{name:"Disable remote control"}).click();
    console.log("PASS: separate clients paired, selected, played, paused, stopped and released one Mac session.");
  } finally { await browser.close(); }
})().catch(err => { console.error(err); process.exitCode=1; });
