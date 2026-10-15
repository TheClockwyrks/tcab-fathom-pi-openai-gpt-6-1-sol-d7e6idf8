import type { DeepReadonly } from "ts-essentials";
import * as C from "./constants";

export type Direction = "up" | "down" | "left" | "right";
export type Screen =
  | "title"
  | "howto"
  | "countdown"
  | "playing"
  | "paused"
  | "cleared"
  | "gameover";
export type PredatorState = "den" | "wander" | "chase" | "search";
export interface Body {
  x: number;
  y: number;
  tx: number;
  ty: number;
  dir: Direction;
}
export interface Drifter extends Body {
  lit: boolean;
  mind: boolean;
  travel: boolean;
}
export interface Predator extends Drifter {
  kind: C.PredatorKind;
  state: PredatorState;
  released: boolean;
  speed: number;
  alert: boolean;
  detectRange: number | null;
  hearingRange: number | null;
  hearingLock: boolean | null;
  flareCharging: boolean | null;
  flaring: boolean | null;
  flareRadius: number | null;
  fix: { tx: number; ty: number } | null;
  linger: number;
  alertLeft: number;
  mark: number;
  pingIn: number;
  pingGap: number;
  searchTime: number;
  searchPing: boolean;
  chaseSpeed: number;
  flareIn: number;
  flareAge: number;
  fade: number;
  slot: number | null;
}
export interface Pulse {
  source: "forager" | "gloamfin";
  tint: "cyan" | "violet" | "orange";
  ox: number;
  oy: number;
  front: number;
  range: number;
  owner: number | null;
  caught: boolean;
}
export interface InkCloud {
  x: number;
  y: number;
  radius: number;
  remaining: number;
}
export interface FathomState {
  version: number;
  screen: Screen;
  menuIndex: number | null;
  titleIndex: number;
  depth: number;
  score: number;
  lives: number;
  muted: boolean;
  planktonRemaining: number;
  drifterIn: number;
  brightness: number;
  brightHold: number;
  visionRadius: number;
  windowRadius: number;
  sonar: { ready: boolean; cooldown: number; range: number };
  ink: { ready: boolean; cooldown: number };
  grid: {
    cols: number;
    rows: number;
    tile: number;
    originX: number;
    originY: number;
  };
  tiles: string[];
  plankton: string[];
  visibility: string[];
  forager: Body & { moving: boolean };
  drifters: Drifter[];
  predators: Predator[];
  pulses: Pulse[];
  inkClouds: InkCloud[];
  simTime: number;
  accumulator: number;
  screenTime: number;
  playTime: number;
  desired: Direction;
  rng: number;
  pointerStart: { id: number; item: number } | null;
  lightMarks: number[][];
  pendingA: boolean;
  pendingB: boolean;
  heldDirections: Direction[];
  art: Record<string, ImageBitmap[]>;
}
export type ReadState = DeepReadonly<FathomState>;
export const DIRS: Direction[] = ["up", "right", "down", "left"];
export const DELTA: Record<Direction, [number, number]> = {
  up: [0, -1],
  right: [1, 0],
  down: [0, 1],
  left: [-1, 0],
};
export const opposite = (d: Direction): Direction =>
  DIRS[(DIRS.indexOf(d) + 2) % 4];
export function center(tx: number, ty: number) {
  return {
    x: C.GRID_ORIGIN_X + tx * C.TILE + C.TILE / 2,
    y: C.GRID_ORIGIN_Y + ty * C.TILE + C.TILE / 2,
    tx,
    ty,
  };
}
export function locate(b: { x: number; y: number; tx: number; ty: number }) {
  b.tx = Math.floor((b.x - C.GRID_ORIGIN_X) / C.TILE);
  b.ty = Math.floor((b.y - C.GRID_ORIGIN_Y) / C.TILE);
}
export const layer = (ch: string) =>
  Array.from({ length: C.GRID_ROWS }, () => ch.repeat(C.GRID_COLS));
export function put(rows: string[], tx: number, ty: number, ch: string) {
  rows[ty] = rows[ty].slice(0, tx) + ch + rows[ty].slice(tx + 1);
}
export function tile(s: ReadState, x: number, y: number) {
  return s.tiles[y]?.[x] ?? "#";
}
export function neighbor(s: ReadState, tx: number, ty: number, d: Direction) {
  const [dx, dy] = DELTA[d];
  let x = tx + dx;
  const y = ty + dy;
  if (tile(s, 0, ty) === "." && tile(s, C.GRID_COLS - 1, ty) === ".")
    x = (x + C.GRID_COLS) % C.GRID_COLS;
  return { tx: x, ty: y };
}
export function open(s: ReadState, tx: number, ty: number, den = false) {
  const t = tile(s, tx, ty);
  return t === "." || (den && (t === "d" || t === "g"));
}
export function options(s: ReadState, b: DeepReadonly<Body>, den = false) {
  return DIRS.filter((d) => {
    const p = neighbor(s, b.tx, b.ty, d);
    return open(s, p.tx, p.ty, den);
  });
}
export function maze(): string[] {
  const rows = layer("#");
  for (const y of [1, 3, 5, 11, 13, 16])
    for (let x = 1; x < C.GRID_COLS - 1; x++) put(rows, x, y, ".");
  for (const x of [1, 5, 9, 13, 22, 26, 30, 34])
    for (let y = 1; y < C.GRID_ROWS - 1; y++) put(rows, x, y, ".");
  for (let x = 0; x <= 13; x++) {
    put(rows, x, 8, ".");
    put(rows, C.GRID_COLS - 1 - x, 8, ".");
  }
  for (let y = 7; y <= 9; y++)
    for (let x = 16; x <= 19; x++) put(rows, x, y, "d");
  put(rows, 17, 6, "g");
  return rows;
}
export function predator(
  kind: C.PredatorKind,
  tx: number,
  ty: number,
  slot: number | null = null,
): Predator {
  return {
    ...center(tx, ty),
    dir: "up",
    lit: false,
    mind: true,
    travel: true,
    kind,
    state: slot === null ? "wander" : "den",
    released: slot === null,
    speed: C.PREDATOR_SPEED,
    alert: false,
    detectRange: null,
    hearingRange: null,
    hearingLock: kind === "gloamfin" ? false : null,
    flareCharging: kind === "flarefish" ? false : null,
    flaring: kind === "flarefish" ? false : null,
    flareRadius: kind === "flarefish" ? 0 : null,
    fix: null,
    linger: 0,
    alertLeft: 0,
    mark: 0,
    pingIn: C.GLOAMFIN_PING_INTERVAL,
    pingGap: C.GLOAMFIN_PING_MIN_GAP,
    searchTime: 0,
    searchPing: false,
    chaseSpeed: C.GLOAMFIN_CHASE_SPEED,
    flareIn: C.FLARE_INTERVAL,
    flareAge: -1,
    fade: 0,
    slot,
  };
}
export function roster(depth: number) {
  return [
    ...C.DEN_ORDER,
    ...C.ROSTER_ADD_ORDER.slice(0, Math.min(depth, C.ROSTER_CAP_DEPTH) - 1),
  ].map((k, i) => predator(k, 16 + (i % 4), 8 + Math.floor(i / 4), i));
}
export function reconcile(s: FathomState): FathomState {
  locate(s.forager);
  s.drifters.forEach(locate);
  s.predators.forEach((p) => {
    locate(p);
    p.speed =
      p.kind === "lanternjaw" && p.state !== "chase"
        ? C.DRIFTER_SPEED
        : p.kind === "gloamfin" && p.state === "chase"
          ? p.chaseSpeed
          : C.PREDATOR_SPEED;
    p.detectRange =
      p.kind === "gloamfin"
        ? null
        : C.LANTERN_RANGE_BASE + C.LANTERN_RANGE_GAIN * s.brightness;
    p.hearingRange = p.kind === "gloamfin" ? C.GLOAMFIN_HEAR : null;
  });
  s.visionRadius = C.VISION_MIN + C.VISION_GAIN * s.brightness;
  s.windowRadius = C.KINDLE_VISION_MIN + C.KINDLE_VISION_GAIN * s.brightness;
  s.sonar.range = Math.max(
    C.SONAR_RANGE_MIN,
    C.SONAR_RANGE_BASE - (s.depth - 1),
  );
  s.sonar.ready = s.sonar.cooldown === 0;
  s.ink.ready = s.ink.cooldown === 0;
  s.planktonRemaining = s.plankton.join("").split("*").length - 1;
  return s;
}
export function fresh(
  art: FathomState["art"] = {},
  muted = false,
): FathomState {
  const tiles = maze();
  return reconcile({
    version: C.FATHOM_DEBUG_VERSION,
    screen: "title",
    menuIndex: 0,
    titleIndex: 0,
    depth: 1,
    score: 0,
    lives: C.START_LIVES,
    muted,
    planktonRemaining: 0,
    drifterIn: C.DRIFTER_INTERVAL,
    brightness: 0,
    brightHold: 0,
    visionRadius: 0,
    windowRadius: 0,
    sonar: { ready: true, cooldown: 0, range: C.SONAR_RANGE_BASE },
    ink: { ready: true, cooldown: 0 },
    grid: {
      cols: C.GRID_COLS,
      rows: C.GRID_ROWS,
      tile: C.TILE,
      originX: C.GRID_ORIGIN_X,
      originY: C.GRID_ORIGIN_Y,
    },
    tiles,
    plankton: tiles.map((r) => r.replace(/[^.]/g, "-").replace(/\./g, "*")),
    visibility: layer("u"),
    forager: { ...center(17, 13), dir: "left", moving: false },
    drifters: [],
    predators: roster(1),
    pulses: [],
    inkClouds: [],
    simTime: 0,
    accumulator: 0,
    screenTime: 0,
    playTime: 0,
    desired: "left",
    rng: 73291,
    pointerStart: null,
    lightMarks: Array.from({ length: C.GRID_ROWS }, () =>
      Array<number>(C.GRID_COLS).fill(0),
    ),
    pendingA: false,
    pendingB: false,
    heldDirections: [],
    art,
  });
}
export function copy(s: ReadState): FathomState {
  return {
    ...s,
    heldDirections: [...s.heldDirections],
    lightMarks: s.lightMarks.map((r) => [...r]),
    art: s.art as FathomState["art"],
    grid: { ...s.grid },
    tiles: [...s.tiles],
    plankton: [...s.plankton],
    visibility: [...s.visibility],
    forager: { ...s.forager },
    sonar: { ...s.sonar },
    ink: { ...s.ink },
    drifters: s.drifters.map((b) => ({ ...b })),
    predators: s.predators.map((p) => ({
      ...p,
      fix: p.fix ? { ...p.fix } : null,
    })),
    pulses: s.pulses.map((p) => ({ ...p })),
    inkClouds: s.inkClouds.map((c) => ({ ...c })),
    pointerStart: s.pointerStart ? { ...s.pointerStart } : null,
  };
}
export function random(s: FathomState) {
  s.rng = (Math.imul(s.rng, 1664525) + 1013904223) >>> 0;
  return s.rng / 4294967296;
}
export const distance = (
  a: { x: number; y: number },
  b: { x: number; y: number },
) => Math.hypot(a.x - b.x, a.y - b.y);
export const same = (
  a: { tx: number; ty: number },
  b: { tx: number; ty: number },
) => a.tx === b.tx && a.ty === b.ty;
export function enter(s: FathomState, screen: Screen) {
  s.screen = screen;
  s.screenTime = 0;
  s.menuIndex =
    screen === "title"
      ? s.titleIndex
      : screen === "paused" || screen === "gameover"
        ? 0
        : null;
}
export function menu(s: ReadState): readonly string[] {
  return s.screen === "title"
    ? C.TITLE_ITEMS
    : s.screen === "paused"
      ? C.PAUSE_ITEMS
      : s.screen === "gameover"
        ? C.GAMEOVER_ITEMS
        : [];
}
export function menuRect(s: ReadState, i: number) {
  return Number.isInteger(i) && i >= 0 && i < menu(s).length
    ? { x: 470, y: 420 + i * 62, w: 340, h: 50 }
    : null;
}

/** Corridor distance field; shared by navigation and traveling sound. */
export function flood(
  s: ReadState,
  tx: number,
  ty: number,
  den = false,
): number[][] {
  const ds = Array.from({ length: C.GRID_ROWS }, () =>
    Array<number>(C.GRID_COLS).fill(Infinity),
  );
  if (!open(s, tx, ty, den)) return ds;
  ds[ty][tx] = 0;
  const q = [{ tx, ty }];
  for (let i = 0; i < q.length; i++)
    for (const d of DIRS) {
      const p = neighbor(s, q[i].tx, q[i].ty, d);
      if (open(s, p.tx, p.ty, den) && ds[p.ty][p.tx] === Infinity) {
        ds[p.ty][p.tx] = ds[q[i].ty][q[i].tx] + 1;
        q.push(p);
      }
    }
  return ds;
}
export function route(
  s: ReadState,
  b: Body,
  to: { tx: number; ty: number },
  den = false,
): Direction | null {
  const ds = flood(s, to.tx, to.ty, den);
  let best = Infinity;
  let dir: Direction | null = null;
  for (const d of options(s, b, den)) {
    const p = neighbor(s, b.tx, b.ty, d);
    if (ds[p.ty][p.tx] < best) {
      best = ds[p.ty][p.tx];
      dir = d;
    }
  }
  return dir;
}
export function los(
  s: ReadState,
  a: { x: number; y: number },
  b: { x: number; y: number },
  endRock = false,
) {
  // Traverse every crossed cell exactly: sampling can leak through the tiny
  // sliver of rock at an oblique corner. A corner touch crosses neither side.
  const ax = (a.x - C.GRID_ORIGIN_X) / C.TILE;
  const ay = (a.y - C.GRID_ORIGIN_Y) / C.TILE;
  const bx = (b.x - C.GRID_ORIGIN_X) / C.TILE;
  const by = (b.y - C.GRID_ORIGIN_Y) / C.TILE;
  const dx = bx - ax,
    dy = by - ay;
  const sx = Math.sign(dx),
    sy = Math.sign(dy);
  const endX = Math.floor(bx),
    endY = Math.floor(by);
  let tx = Math.floor(ax),
    ty = Math.floor(ay);
  let nextX = sx === 0 ? Infinity : (tx + (sx > 0 ? 1 : 0) - ax) / dx;
  let nextY = sy === 0 ? Infinity : (ty + (sy > 0 ? 1 : 0) - ay) / dy;
  const strideX = sx === 0 ? Infinity : 1 / Math.abs(dx);
  const strideY = sy === 0 ? Infinity : 1 / Math.abs(dy);
  for (;;) {
    const end = tx === endX && ty === endY;
    if (tile(s, tx, ty) === "#" && !(endRock && end)) return false;
    if (end) return true;
    if (Math.abs(nextX - nextY) < 1e-12) {
      tx += sx;
      ty += sy;
      nextX += strideX;
      nextY += strideY;
    } else if (nextX < nextY) {
      tx += sx;
      nextX += strideX;
    } else {
      ty += sy;
      nextY += strideY;
    }
  }
}
export function blinded(s: ReadState, p: DeepReadonly<Body>) {
  const f = s.forager,
    dx = f.x - p.x,
    dy = f.y - p.y,
    l = dx * dx + dy * dy;
  return s.inkClouds.some((c) => {
    const t =
      l === 0
        ? 0
        : Math.max(0, Math.min(1, ((c.x - p.x) * dx + (c.y - p.y) * dy) / l));
    return Math.hypot(c.x - p.x - dx * t, c.y - p.y - dy * t) <= c.radius;
  });
}
/** Integrate to the next center before deciding a turn, never overshooting it. */
export function move(
  s: FathomState,
  b: Body,
  speed: number | (() => number),
  decide: () => Direction | null,
  den = false,
  reverse?: Direction,
) {
  if (!open(s, b.tx, b.ty, den)) return false;
  if (reverse === opposite(b.dir)) b.dir = reverse;
  let left = C.TICK_DT,
    moved = false;
  while (left > 1e-8) {
    const c = center(b.tx, b.ty);
    const at = distance(c, b) < 1e-7;
    if (at) {
      const d = decide();
      if (!d) break;
      b.dir = d;
      const n = neighbor(s, b.tx, b.ty, d);
      if (!open(s, n.tx, n.ty, den)) break;
    }
    const [dx, dy] = DELTA[b.dir];
    let target = dx ? c.x : c.y;
    const pos = dx ? b.x : b.y;
    const sign = dx || dy;
    if (at || (target - pos) * sign <= 1e-7) target += sign * C.TILE;
    const rate = typeof speed === "number" ? speed : speed();
    const step = Math.min(left * rate, Math.abs(target - pos));
    b.x += dx * step;
    b.y += dy * step;
    left -= step / rate;
    moved = true;
    const width = C.GRID_COLS * C.TILE;
    if (b.x < C.GRID_ORIGIN_X) b.x += width;
    if (b.x >= C.GRID_ORIGIN_X + width) b.x -= width;
    locate(b);
  }
  return moved;
}
export function wander(s: FathomState, b: Body, den = false): Direction | null {
  const opts = options(s, b, den);
  const forward = opts.filter((d) => d !== opposite(b.dir));
  const pool = forward.length ? forward : opts;
  return pool.length ? pool[Math.floor(random(s) * pool.length)] : null;
}
