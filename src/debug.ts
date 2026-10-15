import * as C from "./constants";
import {
  center,
  copy,
  enter,
  fresh,
  layer,
  menu,
  menuRect,
  open,
  predator,
  put,
  reconcile,
  roster,
  tile,
  DIRS,
} from "./world";
import type { Direction, FathomState, ReadState, Screen } from "./world";

function check(ok: boolean): asserts ok {
  if (!ok) throw new RangeError("Invalid Fathom pose");
}
function number(n: number, min = 0, max = Infinity, integer = false) {
  check(
    Number.isFinite(n) &&
      n >= min &&
      n <= max &&
      (!integer || Number.isInteger(n)),
  );
}
function grid(tx: number, ty: number) {
  number(tx, 0, C.GRID_COLS - 1, true);
  number(ty, 0, C.GRID_ROWS - 1, true);
}
function corridor(s: ReadState, tx: number, ty: number) {
  grid(tx, ty);
  check(tile(s, tx, ty) === ".");
}
function pose(s: ReadState, fn: (s: FathomState) => void) {
  const n = copy(s);
  fn(n);
  return reconcile(n);
}
function pred(s: FathomState, i: number) {
  number(i, 0, s.predators.length - 1, true);
  return s.predators[i];
}
function drift(s: FathomState, i: number) {
  number(i, 0, s.drifters.length - 1, true);
  return s.drifters[i];
}
function bool(b: boolean) {
  check(typeof b === "boolean");
}
function dir(d: Direction) {
  check(DIRS.includes(d));
}
export function snapshot(s: ReadState) {
  return {
    version: s.version,
    screen: s.screen,
    menuIndex: s.menuIndex,
    titleIndex: s.titleIndex,
    depth: s.depth,
    score: s.score,
    lives: s.lives,
    muted: s.muted,
    planktonRemaining: s.planktonRemaining,
    drifterIn: s.drifterIn,
    brightness: s.brightness,
    brightHold: s.brightHold,
    visionRadius: s.visionRadius,
    windowRadius: s.windowRadius,
    sonar: { ...s.sonar },
    ink: { ...s.ink },
    grid: { ...s.grid },
    tiles: [...s.tiles],
    plankton: [...s.plankton],
    visibility: [...s.visibility],
    forager: { ...s.forager },
    drifters: s.drifters.map(({ x, y, tx, ty, lit, mind, travel }) => ({
      x,
      y,
      tx,
      ty,
      lit,
      mind,
      travel,
    })),
    predators: s.predators.map(
      ({
        kind,
        x,
        y,
        tx,
        ty,
        dir,
        state,
        released,
        mind,
        travel,
        speed,
        alert,
        lit,
        detectRange,
        hearingRange,
        hearingLock,
        flareCharging,
        flaring,
        flareRadius,
      }) => ({
        kind,
        x,
        y,
        tx,
        ty,
        dir,
        state,
        released,
        mind,
        travel,
        speed,
        alert,
        lit,
        detectRange,
        hearingRange,
        hearingLock,
        flareCharging,
        flaring,
        flareRadius,
      }),
    ),
    pulses: s.pulses.map(({ source, tint, ox, oy, front, range }) => ({
      source,
      tint,
      ox,
      oy,
      front,
      range,
    })),
    inkClouds: s.inkClouds.map((c) => ({ ...c })),
    simTime: s.simTime,
  };
}
export const debug = {
  version: C.FATHOM_DEBUG_VERSION,
  reset: (s: ReadState) => fresh(s.art as FathomState["art"], s.muted),
  snapshot,
  reconcile: (s: ReadState) => reconcile(copy(s)),
  setScreen: (s: ReadState, screen: Screen) =>
    pose(s, (n) => {
      check(
        [
          "title",
          "howto",
          "countdown",
          "playing",
          "paused",
          "cleared",
          "gameover",
        ].includes(screen),
      );
      enter(n, screen);
      if (screen === "playing") n.playTime = 0;
    }),
  setMenuIndex: (s: ReadState, index: number) =>
    pose(s, (n) => {
      number(index, 0, menu(n).length - 1, true);
      n.menuIndex = index;
    }),
  setTitleIndex: (s: ReadState, index: number) =>
    pose(s, (n) => {
      number(index, 0, C.TITLE_ITEMS.length - 1, true);
      n.titleIndex = index;
    }),
  menuItemRect: menuRect,
  setScore: (s: ReadState, points: number) =>
    pose(s, (n) => {
      number(points, 0, Infinity, true);
      n.score = points;
    }),
  setLives: (s: ReadState, lives: number) =>
    pose(s, (n) => {
      number(lives, 0, Infinity, true);
      n.lives = lives;
    }),
  setDepth: (s: ReadState, d: number) =>
    pose(s, (n) => {
      number(d, 1, Infinity, true);
      n.depth = d;
      n.predators = roster(d);
      n.playTime = 0;
    }),
  setMaze: (s: ReadState, rows: readonly string[]) =>
    pose(s, (n) => {
      check(
        rows.length === C.GRID_ROWS &&
          rows.every((r) => r.length === C.GRID_COLS && /^[#.gd]+$/.test(r)),
      );
      const all = rows.join("");
      check(!/[dg]/.test(all) || all.split("g").length === 2);
      n.tiles = [...rows];
    }),
  setPlankton: (s: ReadState, tx: number, ty: number, present: boolean) =>
    pose(s, (n) => {
      corridor(n, tx, ty);
      bool(present);
      put(n.plankton, tx, ty, present ? "*" : "-");
    }),
  clearPlankton: (s: ReadState) =>
    pose(s, (n) => {
      n.plankton = layer("-");
    }),
  clearFog: (s: ReadState) =>
    pose(s, (n) => {
      n.visibility = layer("u");
    }),
  setForagerTile: (s: ReadState, tx: number, ty: number) =>
    pose(s, (n) => {
      corridor(n, tx, ty);
      Object.assign(n.forager, center(tx, ty), { moving: false });
    }),
  setForagerDir: (s: ReadState, d: Direction) =>
    pose(s, (n) => {
      dir(d);
      n.forager.dir = d;
      n.desired = d;
      n.forager.moving = false;
    }),
  setBrightness: (s: ReadState, g: number) =>
    pose(s, (n) => {
      number(g, 0, 1);
      n.brightness = g;
    }),
  setBrightHold: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds, 0, C.BRIGHT_HOLD);
      n.brightHold = seconds;
    }),
  clearPredators: (s: ReadState) =>
    pose(s, (n) => {
      n.predators = [];
    }),
  addPredator: (s: ReadState, kind: C.PredatorKind, tx: number, ty: number) =>
    pose(s, (n) => {
      check(C.DEN_ORDER.includes(kind));
      corridor(n, tx, ty);
      n.predators.push(predator(kind, tx, ty));
    }),
  setPredatorTile: (s: ReadState, i: number, tx: number, ty: number) =>
    pose(s, (n) => {
      grid(tx, ty);
      check(open(n, tx, ty, true));
      Object.assign(pred(n, i), center(tx, ty));
    }),
  setPredatorDir: (s: ReadState, i: number, d: Direction) =>
    pose(s, (n) => {
      dir(d);
      pred(n, i).dir = d;
    }),
  setPredatorState: (
    s: ReadState,
    i: number,
    value: "den" | "wander" | "chase",
  ) =>
    pose(s, (n) => {
      check(["den", "wander", "chase"].includes(value));
      const p = pred(n, i);
      check(
        value === "den"
          ? ["d", "g"].includes(tile(n, p.tx, p.ty))
          : tile(n, p.tx, p.ty) === ".",
      );
      p.state = value;
      p.fix = value === "chase" ? { tx: n.forager.tx, ty: n.forager.ty } : null;
      p.linger = C.LINGER_TIME;
      p.hearingLock = p.kind === "gloamfin" ? false : null;
      p.alertLeft = 0;
      p.alert = false;
      p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
      p.flareAge = -1;
      p.flareIn = C.FLARE_INTERVAL;
      p.flaring = p.kind === "flarefish" ? false : null;
      p.flareCharging = p.kind === "flarefish" ? false : null;
      p.flareRadius = p.kind === "flarefish" ? 0 : null;
    }),
  setPredatorReleased: (s: ReadState, i: number, b: boolean) =>
    pose(s, (n) => {
      bool(b);
      pred(n, i).released = b;
    }),
  setPredatorMind: (s: ReadState, i: number, b: boolean) =>
    pose(s, (n) => {
      bool(b);
      pred(n, i).mind = b;
    }),
  setPredatorTravel: (s: ReadState, i: number, b: boolean) =>
    pose(s, (n) => {
      bool(b);
      pred(n, i).travel = b;
    }),
  spawnDrifter: (s: ReadState, tx: number, ty: number) =>
    pose(s, (n) => {
      corridor(n, tx, ty);
      n.drifters.push({
        ...center(tx, ty),
        dir: "up",
        lit: false,
        mind: true,
        travel: true,
      });
    }),
  clearDrifters: (s: ReadState) =>
    pose(s, (n) => {
      n.drifters = [];
    }),
  setDrifterMind: (s: ReadState, i: number, b: boolean) =>
    pose(s, (n) => {
      bool(b);
      drift(n, i).mind = b;
    }),
  setDrifterTravel: (s: ReadState, i: number, b: boolean) =>
    pose(s, (n) => {
      bool(b);
      drift(n, i).travel = b;
    }),
  setDrifterIn: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds, 0, C.DRIFTER_INTERVAL);
      n.drifterIn = seconds;
    }),
  setSonarCooldown: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds);
      n.sonar.cooldown = seconds;
    }),
  setInkCooldown: (s: ReadState, seconds: number) =>
    pose(s, (n) => {
      number(seconds);
      n.ink.cooldown = seconds;
    }),
};
export type FathomDebugApi = typeof debug;
