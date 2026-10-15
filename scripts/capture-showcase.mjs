/* global document, KeyboardEvent */
import process from "node:process";
import { Buffer } from "node:buffer";
import console from "node:console";

// Run against `npm run dev`: node scripts/capture-showcase.mjs [base URL].
// The capture uses a private engine, not an extra global on the shipped page.
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";

const browser = await chromium.launch({ args: ["--no-sandbox"] });
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 720 },
  });
  await page.goto(process.argv[2] ?? "http://localhost:5173");
  await page.waitForTimeout(1000);
  const captured = await page.evaluate(async () => {
    const { createEngine, ConstantClock } =
      await import("/node_modules/@clockwyrks/simple-2d/dist/index.js");
    const { game, BACKGROUND } = await import("/src/game.ts");
    const C = await import("/src/constants.ts");
    const canvas = document.createElement("canvas");
    canvas.style.cssText =
      "position:fixed;inset:0;width:100vw;height:100vh;z-index:5";
    document.body.append(canvas);
    const engine = createEngine({
      canvas,
      game,
      background: BACKGROUND,
      width: C.STAGE_W,
      height: C.STAGE_H,
      layout: C.LAYOUT,
      clock: new ConstantClock(1000 / 30),
    });
    await engine.initialize();
    const d = engine.debug;
    await engine.advance(1);
    const title = canvas.toDataURL("image/png");
    engine.apply((s) => d.setScreen(s, "howto"));
    await engine.advance(1);
    const guide = canvas.toDataURL("image/png");
    engine.apply((s) => d.setScreen(s, "playing"));
    engine.apply((s) => d.clearPredators(s));
    engine.apply((s) => d.setForagerTile(s, 13, 13));
    engine.apply((s) => d.addPredator(s, "flarefish", 26, 8));
    engine.apply((s) => d.setPredatorTravel(s, 0, false));
    await engine.advance(204);
    engine.apply((s) => d.addPredator(s, "lanternjaw", 5, 13));
    engine.apply((s) => d.addPredator(s, "gloamfin", 9, 11));
    engine.apply((s) => d.spawnDrifter(s, 9, 13));
    engine.apply((s) => d.setBrightness(s, 1));
    engine.apply((s) => d.setBrightHold(s, C.BRIGHT_HOLD));
    function key(code, type = "keydown") {
      document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
    }
    engine.startRecording();
    key("ArrowRight");
    key("Space");
    let dive = "";
    for (let i = 0; i < 120; i++) {
      if (i === 1) key("Space", "keyup");
      if (i === 50) key("Space");
      if (i === 51) key("Space", "keyup");
      if (i === 95) key("ShiftLeft");
      if (i === 96) key("ShiftLeft", "keyup");
      await engine.advance(1);
      if (i === 26) dive = canvas.toDataURL("image/png");
    }
    key("ArrowRight", "keyup");
    const recording = engine.stopRecording();
    const final = d.snapshot(engine.state);
    engine.destroy();
    return { title, guide, dive, recording, final };
  });
  await mkdir("showcase", { recursive: true });
  for (const name of ["title", "guide", "dive"])
    await writeFile(
      `showcase/${name}.png`,
      Buffer.from(captured[name].split(",")[1], "base64"),
    );
  await writeFile(
    "showcase/kindle-dive.json.gz",
    gzipSync(JSON.stringify(captured.recording)),
  );
  console.log(
    `${captured.recording.frames.length} live frames captured; final screen: ${captured.final.screen}, score: ${captured.final.score}`,
  );
} finally {
  await browser.close();
}
