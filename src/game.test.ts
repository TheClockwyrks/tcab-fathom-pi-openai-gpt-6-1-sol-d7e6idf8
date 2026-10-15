/// <reference types="node" />
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { readFile } from "node:fs/promises";
import { createCanvas, loadImage } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { game, BACKGROUND } from "./game";
import type { FathomState, FathomDebugApi } from "./game";
import * as C from "./constants";
import { center, flood, fresh, maze, neighbor, options, tile } from "./world";
import { debug } from "./debug";

beforeAll(() => {
  vi.stubGlobal(
    "fetch",
    async (url: string) => new Response(await readFile(url)),
  );
  vi.stubGlobal("createImageBitmap", async (blob: Blob) =>
    loadImage(Buffer.from(await blob.arrayBuffer())),
  );
});
const engines: Engine<FathomState, FathomDebugApi>[] = [];
afterEach(() => {
  engines.splice(0).forEach((e) => e.destroy());
});
async function setup(ms = 1000 / 60) {
  const target = new EventTarget();
  const canvas = createCanvas(C.STAGE_W, C.STAGE_H);
  const e = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: C.STAGE_W,
    height: C.STAGE_H,
    background: BACKGROUND,
    layout: C.LAYOUT,
    clock: new ConstantClock(ms),
    surface: {
      cssWidth: () => C.STAGE_W,
      cssHeight: () => C.STAGE_H,
      dpr: () => 1,
      events: () => target,
    },
    game,
  });
  engines.push(e);
  await e.initialize();
  function key(code: string, down = true) {
    const event = new Event(down ? "keydown" : "keyup");
    Object.assign(event, { code, repeat: false });
    target.dispatchEvent(event);
  }
  async function press(code: string) {
    key(code);
    await e.advance(1);
    key(code, false);
  }
  function pointer(type: string, x: number, y: number) {
    const event = new Event(`pointer${type}`);
    Object.assign(event, {
      clientX: x,
      clientY: y,
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      button: 0,
      buttons: type === "up" ? 0 : 1,
    });
    target.dispatchEvent(event);
  }
  return { e, key, press, pointer, canvas };
}
function fixture() {
  return Array.from({ length: C.GRID_ROWS }, (_, y) =>
    y === 5 ? "#" + ".".repeat(C.GRID_COLS - 2) + "#" : "#".repeat(C.GRID_COLS),
  );
}
async function corridor(ms = 1000 / 60) {
  const t = await setup(ms);
  const { e } = t;
  e.apply((s) => debug.setMaze(s, fixture()));
  e.apply((s) => debug.clearPredators(s));
  e.apply((s) => debug.clearPlankton(s));
  e.apply((s) => debug.setForagerTile(s, 5, 5));
  e.apply((s) => debug.setScreen(s, "playing"));
  return t;
}

describe("maze and state contract", () => {
  it("lays out a symmetric connected single-width maze with a sealed den and measured proportions", () => {
    const s = fresh();
    expect(maze()).toHaveLength(C.GRID_ROWS);
    const ds = flood(s, 17, 13);
    let count = 0,
      degree = 0;
    const degreeTwo = new Set<string>();
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const t = tile(s, x, y),
          m = tile(s, C.GRID_COLS - 1 - x, y);
        if (!"dg".includes(t) && !"dg".includes(m)) expect(t).toBe(m);
        if (t !== ".") continue;
        count++;
        expect(ds[y][x]).toBeLessThan(Infinity);
        const n = options(s, { ...center(x, y), dir: "up" }).length;
        expect(n).toBeGreaterThanOrEqual(2);
        degree += n;
        if (n === 2) degreeTwo.add(`${x},${y}`);
        expect(
          [tile(s, x + 1, y), tile(s, x, y + 1), tile(s, x + 1, y + 1)].every(
            (t) => t === ".",
          ),
        ).toBe(false);
      }
    const runs: number[] = [];
    while (degreeTwo.size) {
      const start = degreeTwo.values().next().value!;
      const q = [start];
      degreeTwo.delete(start);
      for (let i = 0; i < q.length; i++) {
        const [x, y] = q[i].split(",").map(Number);
        for (const d of ["up", "right", "down", "left"] as const) {
          const p = neighbor(s, x, y, d),
            k = `${p.tx},${p.ty}`;
          if (degreeTwo.delete(k)) q.push(k);
        }
      }
      runs.push(q.length);
    }
    expect(count / 544).toBeGreaterThanOrEqual(C.MAZE_DENSITY_MIN);
    expect(degree / count).toBeLessThanOrEqual(C.MAZE_OPENNESS_MAX);
    const run = runs.reduce((a, b) => a + b, 0) / runs.length;
    expect(run).toBeGreaterThanOrEqual(C.MAZE_MAZING_MIN);
    expect(run).toBeLessThanOrEqual(C.MAZE_MAZING_MAX);
    expect(s.planktonRemaining).toBe(count);
    expect(s.visibility.join("")).toBe("u".repeat(C.GRID_ROWS * C.GRID_COLS));
    for (let y = 7; y <= 9; y++)
      for (let x = 16; x <= 19; x++) {
        expect(tile(s, x, y)).toBe("d");
        expect(options(s, { ...center(x, y), dir: "up" })).toHaveLength(0);
      }
  });
  it("returns independent JSON readings, immutable poses and idempotent reconcile", () => {
    const s = fresh(),
      n = debug.setBrightness(s, 1);
    expect(s.brightness).toBe(0);
    expect(n.visionRadius).toBe(C.VISION_MIN + C.VISION_GAIN);
    expect(n.windowRadius).toBe(C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN);
    const snap = debug.snapshot(n);
    snap.tiles[0] = "no";
    expect(n.tiles[0]).not.toBe("no");
    expect(() => JSON.stringify(debug.snapshot(n))).not.toThrow();
    expect(debug.reconcile(n)).toEqual(n);
    expect(debug.reconcile(debug.clearFog(n)).visibility).toEqual(s.visibility);
  });
  it("poses each body independently and reset restores a pristine title", () => {
    let s = fresh();
    s = debug.setTitleIndex(s, 1);
    s = debug.setLives(s, 0);
    s = debug.setDepth(s, 4);
    s = debug.setPredatorTile(s, 0, 13, 13);
    s = debug.setPredatorDir(s, 0, "right");
    s = debug.setPredatorState(s, 0, "wander");
    s = debug.setPredatorReleased(s, 0, true);
    expect(s.predators[0].state).toBe("wander");
    expect(s.predators[0].released).toBe(true);
    s = debug.spawnDrifter(s, 9, 13);
    s = debug.setDrifterMind(s, 0, false);
    s = debug.clearDrifters(s);
    s = debug.setForagerDir(s, "up");
    s = debug.setInkCooldown(s, 100);
    expect(s.ink.ready).toBe(false);
    expect(debug.snapshot(debug.reset(s))).toEqual(debug.snapshot(fresh()));
  });
  it("validates every pose domain rather than quietly clamping it", () => {
    const s = fresh();
    expect(() => debug.setBrightness(s, 1.1)).toThrow();
    expect(() =>
      debug.setMenuIndex(debug.setScreen(s, "playing"), 0),
    ).toThrow();
    expect(() => debug.setScore(s, -1)).toThrow();
    expect(() => debug.setDepth(s, 0)).toThrow();
    expect(() => debug.setForagerTile(s, 0, 0)).toThrow();
    expect(() => debug.setMaze(s, [])).toThrow();
    expect(() => debug.setPredatorMind(s, 99, false)).toThrow();
    expect(() => debug.setDrifterIn(s, C.DRIFTER_INTERVAL + 1)).toThrow();
    expect(debug.setSonarCooldown(s, 100).sonar.cooldown).toBe(100);
  });
});

describe("engine-driven screens and inputs", () => {
  it("loads all art and diagnostics, remembers title selection and starts a countdown", async () => {
    const { e, press } = await setup();
    expect(e.state.art["trench-walls"]).toHaveLength(19);
    expect(e.debug.version).toBe(C.FATHOM_DEBUG_VERSION);
    await press("ArrowDown");
    await press("Enter");
    expect(e.state.screen).toBe("howto");
    expect(e.state.titleIndex).toBe(1);
    await press("Escape");
    expect(e.state.menuIndex).toBe(1);
    await press("ArrowUp");
    await press("Space");
    expect(e.state.screen).toBe("countdown");
    expect(e.state.pulses).toHaveLength(0);
    await e.advance(120);
    expect(e.state.screen).toBe("playing");
    expect(
      e
        .diagnostics()
        .some(
          (d) => d.name === "windowRadius" && d.value === e.state.windowRadius,
        ),
    ).toBe(true);
  });
  it("pauses once per Escape edge and freezes the board but not simulation time", async () => {
    const { e, press } = await corridor();
    await press("Escape");
    expect(e.state.screen).toBe("paused");
    const before = debug.snapshot(e.state);
    await e.advance(60);
    expect(e.state.forager).toEqual(before.forager);
    expect(e.state.simTime).toBeGreaterThan(before.simTime);
    await press("Escape");
    expect(e.state.screen).toBe("playing");
    await press("KeyM");
    expect(e.state.muted).toBe(true);
    e.apply((s) => debug.reset(s));
    expect(e.state.muted).toBe(true);
  });
  it("confirms a pointer only when both edges land on the same item", async () => {
    const { e, pointer } = await setup();
    const a = debug.menuItemRect(e.state, 0)!,
      b = debug.menuItemRect(e.state, 1)!;
    pointer("down", a.x + 10, a.y + 10);
    pointer("up", b.x + 10, b.y + 10);
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    pointer("down", b.x + 10, b.y + 10);
    pointer("up", b.x + 10, b.y + 10);
    await e.advance(1);
    expect(e.state.screen).toBe("howto");
    pointer("down", 100, 100);
    pointer("up", 100, 100);
    await e.advance(1);
    expect(e.state.screen).toBe("title");
    expect(e.state.menuIndex).toBe(1);
  });
  it("restarts and returns to the title through pause and game-over menus", async () => {
    const { e, press } = await corridor();
    e.apply((s) => debug.setScore(s, 123));
    await press("KeyP");
    e.apply((s) => debug.setMenuIndex(s, 1));
    await press("Enter");
    expect(e.state.screen).toBe("countdown");
    expect(e.state.score).toBe(0);
    e.apply((s) => debug.setScreen(s, "paused"));
    e.apply((s) => debug.setMenuIndex(s, 2));
    await press("Enter");
    expect(e.state.screen).toBe("title");
    e.apply((s) => debug.setScreen(s, "gameover"));
    e.apply((s) => debug.setMenuIndex(s, 1));
    await press("Enter");
    expect(e.state.screen).toBe("title");
  });
});

describe("movement, light and resources", () => {
  it("moves continuously at the specified speed and stops on release", async () => {
    const { e, key } = await corridor();
    const x = e.state.forager.x;
    key("ArrowRight");
    await e.advance(30);
    expect(e.state.forager.x - x).toBeCloseTo(C.FORAGER_SPEED / 2);
    key("ArrowRight", false);
    await e.advance(30);
    expect(e.state.forager.x - x).toBeCloseTo(C.FORAGER_SPEED / 2);
    expect(e.state.forager.moving).toBe(false);
  });
  it("runs equal tick counts and motion over different frame rates", async () => {
    const a = await corridor(1000 / 30),
      b = await corridor(1000 / 120);
    a.key("ArrowRight");
    b.key("ArrowRight");
    await a.e.advance(30);
    await b.e.advance(120);
    expect(debug.snapshot(a.e.state)).toEqual(debug.snapshot(b.e.state));
  });
  it("wraps continuously in one tile step", async () => {
    const { e, key } = await corridor();
    const rows = fixture();
    rows[5] = ".".repeat(C.GRID_COLS);
    e.apply((s) => debug.setMaze(s, rows));
    e.apply((s) => debug.setForagerTile(s, 0, 5));
    key("ArrowLeft");
    await e.advance(15);
    expect(e.state.forager.x).toBeCloseTo(center(C.GRID_COLS - 1, 5).x);
  });
  it("buffers perpendicular turns at centers and reverses between centers", async () => {
    const { e, key } = await corridor();
    const rows = fixture();
    rows[4] = "#".repeat(7) + "." + "#".repeat(C.GRID_COLS - 8);
    e.apply((s) => debug.setMaze(s, rows));
    key("ArrowRight");
    await e.advance(20);
    key("ArrowRight", false);
    key("ArrowUp");
    await e.advance(20);
    expect(e.state.forager.tx).toBe(7);
    expect(e.state.forager.y).toBeLessThan(center(7, 5).y);
    key("ArrowUp", false);
    key("ArrowDown");
    await e.advance(1);
    expect(e.state.forager.dir).toBe("down");
  });
  it("clips remembered terrain to a true circle without discarding its memory", async () => {
    const { e, canvas } = await setup();
    e.apply((s) => ({
      ...s,
      tiles: [...s.tiles],
      plankton: [...s.plankton],
      visibility: Array.from({ length: C.GRID_ROWS }, () =>
        "r".repeat(C.GRID_COLS),
      ),
      forager: { ...s.forager, ...center(5, 5) },
      predators: [],
      drifters: [],
      pulses: [],
      inkClouds: [],
      lightMarks: s.lightMarks.map((r) => [...r]),
      heldDirections: [],
      art: s.art as FathomState["art"],
    }));
    e.apply((s) => debug.setScreen(s, "paused"));
    await e.advance(1);
    const ctx = canvas.getContext("2d"),
      inside = center(1, 1),
      outside = center(30, 1);
    const a = ctx.getImageData(inside.x, inside.y, 1, 1).data,
      b = ctx.getImageData(outside.x, outside.y, 1, 1).data;
    expect(Array.from(b)).toEqual([3, 6, 12, 255]);
    expect(Array.from(a)).not.toEqual(Array.from(b));
    expect(e.state.visibility[1][30]).toBe("r");
  });
  it("holds brightness then decays exponentially and remembers occluded ground", async () => {
    const { e } = await corridor();
    e.apply((s) => debug.setBrightness(s, 1));
    e.apply((s) => debug.setBrightHold(s, C.BRIGHT_HOLD));
    await e.advance(60);
    expect(e.state.brightness).toBeCloseTo(1);
    await e.advance(54);
    expect(e.state.brightness).toBeCloseTo(0.5);
    expect(e.state.visibility[5][5]).toBe("l");
    e.apply((s) => debug.setForagerTile(s, 28, 5));
    await e.advance(1);
    expect(e.state.visibility[5][5]).toBe("r");
    const rows = fixture();
    rows[5] = rows[5].slice(0, 29) + "#" + rows[5].slice(30);
    e.apply((s) => debug.setMaze(s, rows));
    e.apply((s) => debug.clearFog(s));
    await e.advance(1);
    expect(e.state.visibility[5][29]).toBe("l");
    expect(e.state.visibility[5][30]).toBe("u");
  });
  it("casts a traveling path pulse, respects cooldowns, and releases stationary ink", async () => {
    const { e, press, key } = await corridor();
    const events: string[] = [];
    e.events.on("cue:played", (v) => events.push(v.cue));
    await press("Space");
    expect(e.state.pulses).toHaveLength(1);
    expect(e.state.pulses[0].front).toBeCloseTo(C.SONAR_WAVE_SPEED / 60);
    expect(e.state.visibility[5][12]).toBe("u");
    await press("Space");
    expect(e.state.pulses).toHaveLength(1);
    await e.advance(30);
    expect(e.state.visibility[5][12]).toBe("l");
    await press("ShiftLeft");
    const cloud = { ...e.state.inkClouds[0] };
    key("ArrowRight");
    await e.advance(30);
    key("ArrowRight", false);
    expect(e.state.inkClouds[0].x).toBe(cloud.x);
    expect(e.state.inkClouds[0].radius).toBe(C.INK_RADIUS);
    await e.advance(181);
    expect(e.state.inkClouds).toHaveLength(0);
    expect(events).toContain(C.CUES.ink);
    expect(events).toContain(C.CUES.sonar);
  });
});

describe("scoring, encounters and depth", () => {
  it("awards plankton, brightness, clear bonus and descends", async () => {
    const { e } = await corridor();
    e.apply((s) => debug.setPlankton(s, 5, 5, true));
    await e.advance(1);
    expect(e.state.score).toBe(C.SCORE_PLANKTON + C.SCORE_CLEAR);
    expect(e.state.screen).toBe("cleared");
    expect(e.state.brightness).toBeCloseTo(C.BRIGHT_PER_EAT);
    await e.advance(120);
    expect(e.state.depth).toBe(2);
    expect(e.state.screen).toBe("countdown");
    expect(e.state.predators).toHaveLength(4);
    expect(e.state.sonar.range).toBe(8);
  });
  it("admits and eats drifters, with cadence ceiling and mind/travel switches", async () => {
    const { e } = await setup();
    e.apply((s) => debug.clearPredators(s));
    e.apply((s) => debug.setScreen(s, "playing"));
    e.apply((s) => debug.setDrifterIn(s, 0));
    await e.advance(1);
    expect(e.state.drifters).toHaveLength(1);
    expect(e.state.drifterIn).toBeLessThanOrEqual(C.DRIFTER_INTERVAL);
    e.apply((s) => debug.spawnDrifter(s, 17, 13));
    e.apply((s) => debug.setDrifterMind(s, 1, false));
    const score = e.state.score;
    await e.advance(1);
    expect(e.state.score - score).toBe(C.SCORE_DRIFTER);
    e.apply((s) => debug.setDrifterTravel(s, 0, false));
    const b = e.state.drifters[0];
    await e.advance(20);
    expect(e.state.drifters[0].x).toBe(b.x);
  });
  it("preserves eaten plankton and fog on life loss, then ends at zero reserves", async () => {
    const { e } = await corridor();
    e.apply((s) => debug.addPredator(s, "lanternjaw", 5, 5));
    e.apply((s) => debug.setPredatorMind(s, 0, false));
    e.apply((s) => debug.setScore(s, 70));
    await e.advance(1);
    expect(e.state.lives).toBe(C.START_LIVES - 1);
    expect(e.state.screen).toBe("countdown");
    expect(e.state.score).toBe(70);
    expect(e.state.planktonRemaining).toBe(0);
    e.apply((s) => debug.setLives(s, 0));
    e.apply((s) => debug.setForagerTile(s, 5, 5));
    e.apply((s) => debug.clearPredators(s));
    e.apply((s) => debug.addPredator(s, "gloamfin", 5, 5));
    e.apply((s) => debug.setPredatorTravel(s, 0, false));
    e.apply((s) => debug.setScreen(s, "playing"));
    await e.advance(1);
    expect(e.state.screen).toBe("gameover");
    expect(e.state.lives).toBe(0);
  });
  it("caps the roster and staggers release independently of travel", async () => {
    const { e } = await setup();
    e.apply((s) => debug.setDepth(s, 8));
    expect(e.state.predators).toHaveLength(6);
    expect(e.state.sonar.range).toBe(C.SONAR_RANGE_MIN);
    e.apply((s) => debug.setScreen(s, "playing"));
    for (let i = 0; i < 6; i++)
      e.apply((s) => debug.setPredatorTravel(s, i, false));
    await e.advance(300);
    expect(e.state.predators[0].released).toBe(true);
    expect(e.state.predators[1].released).toBe(true);
    expect(e.state.predators[2].released).toBe(false);
    expect(e.state.predators[1].state).toBe("den");
  });
});

describe("three independent hunting senses", () => {
  it("routes a chase around rock rather than cutting across it", async () => {
    const { e } = await corridor();
    const rows = fixture();
    rows[5] = rows[5].slice(0, 8) + "#" + rows[5].slice(9);
    rows[3] = "#" + ".".repeat(34) + "#";
    rows[4] = "#".repeat(5) + "." + "#".repeat(5) + "." + "#".repeat(24);
    e.apply((s) => debug.setMaze(s, rows));
    e.apply((s) => debug.addPredator(s, "gloamfin", 11, 5));
    e.apply((s) => debug.setPredatorState(s, 0, "chase"));
    await e.advance(60);
    expect(
      tile(e.state, e.state.predators[0].tx, e.state.predators[0].ty),
    ).toBe(".");
    expect(e.state.predators[0].ty).toBe(3);
    expect(e.state.predators[0].x).toBeLessThan(center(11, 3).x);
  });
  it("searches a stale sound fix and fires exactly one orange lost-you ping", async () => {
    const { e } = await corridor();
    e.apply((s) => debug.setForagerTile(s, 12, 5));
    e.apply((s) => debug.addPredator(s, "gloamfin", 9, 5));
    e.apply((s) => debug.setPredatorState(s, 0, "chase"));
    e.apply((s) => debug.setForagerTile(s, 30, 5));
    await e.advance(55);
    expect(e.state.predators[0].state).toBe("search");
    await e.advance(76);
    expect(e.state.predators[0].searchPing).toBe(true);
    expect(e.state.pulses.some((p) => p.tint === "orange")).toBe(true);
    await e.advance(310);
    expect(e.state.predators[0].state).toBe("wander");
  });
  it("locks on during a bloom through a rock wall", async () => {
    const { e } = await corridor();
    e.apply((s) => debug.addPredator(s, "flarefish", 10, 5));
    e.apply((s) => debug.setPredatorTravel(s, 0, false));
    const rows = fixture();
    rows[5] = rows[5].slice(0, 8) + "#" + rows[5].slice(9);
    e.apply((s) => debug.setMaze(s, rows));
    await e.advance(452);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].flaring).toBe(false);
    expect(e.state.predators[0].alert).toBe(true);
  });
  it("hunts light, lingers when occluded, and drops a fix immediately in ink", async () => {
    const { e, press } = await corridor();
    e.apply((s) => debug.addPredator(s, "lanternjaw", 8, 5));
    e.apply((s) => debug.setPredatorTravel(s, 0, false));
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].alert).toBe(false);
    expect(e.state.predators[0].speed).toBe(C.PREDATOR_SPEED);
    e.apply((s) => debug.setForagerTile(s, 20, 5));
    await e.advance(60);
    expect(e.state.predators[0].state).toBe("chase");
    await e.advance(61);
    expect(e.state.predators[0].state).toBe("wander");
    expect(e.state.predators[0].speed).toBe(C.DRIFTER_SPEED);
    e.apply((s) => debug.setForagerTile(s, 6, 5));
    await e.advance(1);
    await press("ShiftLeft");
    expect(e.state.predators[0].state).toBe("wander");
  });
  it("hears through rock and ink, then seeks a fixed sound rather than tracking silently", async () => {
    const { e, press } = await corridor();
    e.apply((s) => debug.addPredator(s, "gloamfin", 7, 5));
    e.apply((s) => debug.setPredatorTravel(s, 0, false));
    await press("ShiftLeft");
    expect(e.state.predators[0].hearingLock).toBe(true);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].alert).toBe(true);
    e.apply((s) => debug.setForagerTile(s, 15, 5));
    await e.advance(1);
    expect(e.state.predators[0].hearingLock).toBe(false);
    expect(e.state.pulses.some((p) => p.tint === "violet")).toBe(true);
  });
  it("acquires only when a forager wavefront arrives and does not illuminate amber bodies", async () => {
    const { e, press } = await corridor();
    e.apply((s) => debug.addPredator(s, "gloamfin", 12, 5));
    e.apply((s) => debug.setPredatorTravel(s, 0, false));
    e.apply((s) => debug.addPredator(s, "lanternjaw", 11, 5));
    e.apply((s) => debug.setPredatorMind(s, 1, false));
    await press("Space");
    expect(e.state.predators[0].state).toBe("wander");
    await e.advance(30);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].lit).toBe(true);
    expect(e.state.predators[1].lit).toBe(false);
  });
  it("charges and blooms beyond line of sight, reveals through rock and re-arms after fade", async () => {
    const { e } = await corridor(1000 / 30);
    e.apply((s) => debug.addPredator(s, "flarefish", 22, 5));
    e.apply((s) => debug.setPredatorTravel(s, 0, false));
    await e.advance(211);
    expect(e.state.predators[0].flareCharging).toBe(true);
    await e.advance(15);
    expect(e.state.predators[0].flaring).toBe(true);
    expect(e.state.predators[0].flareRadius).toBe(C.FLARE_RADIUS);
    expect(e.state.visibility[3][22]).toBe("l");
    await e.advance(30);
    expect(e.state.predators[0].flaring).toBe(false);
    expect(e.state.visibility[3][22]).toBe("r");
  });
  it("ink blocks a bloom lock while leaving the bloom itself visible", async () => {
    const { e, press } = await corridor();
    e.apply((s) => debug.setForagerTile(s, 30, 5));
    e.apply((s) => debug.addPredator(s, "flarefish", 10, 5));
    e.apply((s) => debug.setPredatorTravel(s, 0, false));
    await e.advance(452);
    expect(e.state.predators[0].flaring).toBe(true);
    e.apply((s) => debug.setForagerTile(s, 5, 5));
    await press("ShiftLeft");
    expect(e.state.predators[0].state).toBe("wander");
    expect(e.state.predators[0].flaring).toBe(true);
    expect(e.state.predators[0].flareRadius).toBe(C.FLARE_RADIUS);
  });
  it("holds disabled minds still while travel-disabled minds continue hunting", async () => {
    const { e } = await corridor();
    e.apply((s) => debug.addPredator(s, "flarefish", 8, 5));
    e.apply((s) => debug.setPredatorMind(s, 0, false));
    const before = e.state.predators[0];
    await e.advance(30);
    expect(e.state.predators[0].x).toBe(before.x);
    expect(e.state.predators[0].state).toBe("wander");
    e.apply((s) => debug.setPredatorMind(s, 0, true));
    e.apply((s) => debug.setPredatorTravel(s, 0, false));
    await e.advance(1);
    expect(e.state.predators[0].state).toBe("chase");
    expect(e.state.predators[0].x).toBe(before.x);
  });
});
