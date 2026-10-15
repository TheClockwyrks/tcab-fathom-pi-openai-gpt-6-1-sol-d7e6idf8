import type { UpdateApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import {
  blinded,
  center,
  copy,
  distance,
  enter,
  flood,
  fresh,
  los,
  menu,
  menuRect,
  move,
  neighbor,
  open,
  options,
  opposite,
  put,
  reconcile,
  roster,
  route,
  same,
  tile,
  wander,
  DIRS,
} from "./world";
import type { Direction, FathomState, Predator, ReadState } from "./world";

const down = (v: number, dt = C.TICK_DT) => Math.max(0, v - dt);
const gate = (s: ReadState) => {
  for (let ty = 0; ty < C.GRID_ROWS; ty++) {
    const tx = s.tiles[ty].indexOf("g");
    if (tx >= 0) return { tx, ty };
  }
  return null;
};
function acquire(s: FathomState, p: Predator, acoustic = false) {
  if (p.state !== "chase" || acoustic) {
    p.chaseSpeed = C.GLOAMFIN_CHASE_SPEED;
    if (p.kind !== "lanternjaw") p.alertLeft = C.ALERT_TIME;
  }
  p.state = "chase";
  p.fix = { tx: s.forager.tx, ty: s.forager.ty };
  p.linger = C.LINGER_TIME;
  if (p.kind === "flarefish") {
    if (p.flareAge >= C.FLARE_CHARGE) p.fade = 0.3;
    p.flareAge = -1;
    p.flareCharging = false;
    p.flaring = false;
    p.flareRadius = 0;
  }
}
function drop(p: Predator) {
  p.state = "wander";
  p.fix = null;
  p.flareAge = -1;
  p.flareIn = C.FLARE_INTERVAL;
}
function ping(
  s: FathomState,
  p: Predator,
  i: number,
  tint: "violet" | "orange",
  cues: Set<C.CueName>,
) {
  s.pulses.push({
    source: "gloamfin",
    tint,
    ox: p.tx,
    oy: p.ty,
    front: 0,
    range: C.GLOAMFIN_PING_RANGE,
    owner: i,
    caught: false,
  });
  p.pingIn = C.GLOAMFIN_PING_INTERVAL;
  p.pingGap = 0;
  cues.add(C.CUES.predatorPing);
}
function mind(s: FathomState, p: Predator, i: number, cues: Set<C.CueName>) {
  if (!p.mind) return;
  if (p.state === "den") {
    if (p.released && p.travel) {
      const g = gate(s);
      if (!g || !s.tiles.some((r) => r.includes("d"))) return;
      const exits = options(s, { ...p, ...g }, true)
        .map((d) => neighbor(s, g.tx, g.ty, d))
        .filter((b) => tile(s, b.tx, b.ty) === ".");
      const target = exits[0];
      if (target) {
        move(s, p, p.speed, () => route(s, p, target, true), true);
        if (tile(s, p.tx, p.ty) === ".") p.state = "wander";
      }
    }
    return;
  }
  if (p.kind === "gloamfin") {
    const previousLock = p.hearingLock;
    p.hearingLock = distance(p, s.forager) <= C.GLOAMFIN_HEAR;
    if (previousLock && !p.hearingLock) p.pingIn = 0;
    if (p.hearingLock) acquire(s, p);
    p.pingIn = down(p.pingIn);
    p.pingGap += C.TICK_DT;
    if (p.state === "search") {
      p.searchTime += C.TICK_DT;
      if (p.searchTime >= C.GLOAMFIN_GIVEUP) drop(p);
      else if (
        p.searchTime >= C.GLOAMFIN_SEARCH_DELAY &&
        !p.searchPing &&
        !p.hearingLock &&
        p.pingGap >= C.GLOAMFIN_PING_MIN_GAP
      ) {
        ping(s, p, i, "orange", cues);
        p.searchPing = true;
      }
    }
    if (
      p.pingIn === 0 &&
      !p.hearingLock &&
      p.pingGap >= C.GLOAMFIN_PING_MIN_GAP
    )
      ping(s, p, i, "violet", cues);
    if (p.state === "chase")
      p.chaseSpeed = Math.min(
        C.GLOAMFIN_CHASE_SPEED,
        p.chaseSpeed +
          ((C.GLOAMFIN_CHASE_SPEED - C.GLOAMFIN_CORNER_SPEED) * C.TICK_DT) /
            C.GLOAMFIN_RAMP_TIME,
      );
  } else {
    const blind = blinded(s, p);
    const sensed =
      !blind &&
      distance(p, s.forager) <= (p.detectRange ?? 0) &&
      los(s, p, s.forager);
    const bloomSense =
      p.kind === "flarefish" &&
      p.flaring &&
      !blind &&
      distance(p, s.forager) <= C.FLARE_RADIUS;
    if (sensed || bloomSense) acquire(s, p);
    else if (blind && p.state === "chase") drop(p);
    else if (p.state === "chase") {
      p.linger = down(p.linger);
      if (p.linger === 0) drop(p);
    }
    if (p.kind === "flarefish") {
      if (p.state === "wander" && p.flareAge < 0) {
        p.flareIn = down(p.flareIn);
        if (p.flareIn === 0) p.flareAge = 0;
      } else if (p.flareAge >= 0) {
        p.flareAge += C.TICK_DT;
        if (p.flareAge >= C.FLARE_CHARGE + C.FLARE_BLOOM) {
          p.flareAge = -1;
          p.fade = 0.3;
          p.flareIn = C.FLARE_INTERVAL;
        }
      }
      const was = p.flaring;
      p.flareCharging = p.flareAge >= 0 && p.flareAge < C.FLARE_CHARGE;
      p.flaring = p.flareAge >= C.FLARE_CHARGE;
      p.flareRadius = p.flaring ? C.FLARE_RADIUS : 0;
      if (p.flaring && !was) cues.add(C.CUES.flare);
      if (p.flaring && !blind && distance(p, s.forager) <= C.FLARE_RADIUS)
        acquire(s, p);
    }
  }
  if (
    p.state === "chase" &&
    p.kind === "gloamfin" &&
    p.fix &&
    same(p, p.fix) &&
    !same(p, s.forager) &&
    distance(p, center(p.tx, p.ty)) < 1e-5
  ) {
    p.state = "search";
    p.searchTime = 0;
    p.searchPing = false;
  }
  reconcile(s);
  if (p.travel) {
    const choose = (): Direction | null => {
      if (p.state === "chase" && p.fix) {
        if (same(p, p.fix)) return null;
        return route(s, p, p.fix);
      }
      if (p.state === "search" && p.fix) {
        const ds = flood(s, p.fix.tx, p.fix.ty);
        if (ds[p.ty][p.tx] >= C.GLOAMFIN_SEARCH_ROAM) return route(s, p, p.fix);
      }
      return wander(s, p);
    };
    let reverse: Direction | undefined;
    if (p.state === "chase" && p.fix) {
      const d = route(s, p, p.fix);
      if (d === opposite(p.dir)) reverse = d ?? undefined;
    }
    move(
      s,
      p,
      () =>
        p.kind === "gloamfin" && p.state === "chase" ? p.chaseSpeed : p.speed,
      () => {
        const old = p.dir;
        const d = choose();
        if (
          p.kind === "gloamfin" &&
          p.state === "chase" &&
          d &&
          d !== old &&
          d !== opposite(old)
        )
          p.chaseSpeed = C.GLOAMFIN_CORNER_SPEED;
        return d;
      },
      false,
      reverse,
    );
  }
}
function pulses(s: FathomState) {
  for (const p of s.pulses) {
    const prev = p.front;
    p.front += C.SONAR_WAVE_SPEED * C.TICK_DT;
    const ds = flood(s, p.ox, p.oy, true);
    const reached = (b: { tx: number; ty: number }) => {
      const d = ds[b.ty]?.[b.tx] ?? Infinity;
      return (
        d <= p.range && d <= p.front && (d > prev || (prev === 0 && d === 0))
      );
    };
    if (p.source === "forager") {
      for (let y = 0; y < C.GRID_ROWS; y++)
        for (let x = 0; x < C.GRID_COLS; x++)
          if (reached({ tx: x, ty: y })) {
            s.lightMarks[y][x] = C.SONAR_MARK_TIME;
            for (const d of DIRS) {
              const n = neighbor(s, x, y, d);
              if (
                tile(s, n.tx, n.ty) === "#" &&
                n.tx >= 0 &&
                n.tx < C.GRID_COLS &&
                n.ty >= 0 &&
                n.ty < C.GRID_ROWS
              )
                s.lightMarks[n.ty][n.tx] = C.SONAR_MARK_TIME;
            }
          }
      s.predators.forEach((h) => {
        if (h.state !== "den" && reached(h) && h.kind !== "lanternjaw") {
          h.mark = C.SONAR_MARK_TIME;
          if (h.kind === "gloamfin" && h.mind) acquire(s, h, true);
        }
      });
    } else if (!p.caught && reached(s.forager)) {
      p.caught = true;
      const h = p.owner === null ? null : s.predators[p.owner];
      if (h?.mind && h.state !== "den") acquire(s, h, true);
    }
  }
  s.pulses = s.pulses.filter((p) => p.front <= p.range);
}
export function lighting(s: FathomState) {
  const flares = s.predators.filter((p) => p.flaring);
  const passive = (b: { x: number; y: number }) =>
    distance(b, s.forager) <= s.visionRadius && los(s, s.forager, b, true);
  const flare = (b: { x: number; y: number }) =>
    flares.some((p) => distance(p, b) <= C.FLARE_RADIUS);
  for (let y = 0; y < C.GRID_ROWS; y++)
    for (let x = 0; x < C.GRID_COLS; x++) {
      const lit =
        passive(center(x, y)) || flare(center(x, y)) || s.lightMarks[y][x] > 0;
      put(
        s.visibility,
        x,
        y,
        lit ? "l" : s.visibility[y][x] === "u" ? "u" : "r",
      );
    }
  s.predators.forEach((p) => {
    p.alert = p.kind !== "lanternjaw" && p.alertLeft > 0;
    p.lit =
      p.state !== "den" &&
      (passive(p) ||
        flare(p) ||
        p.mark > 0 ||
        p.alert ||
        p.flareCharging === true);
  });
  s.drifters.forEach((p) => {
    p.lit = passive(p) || flare(p);
  });
}
function attempt(s: FathomState) {
  s.forager = { ...center(17, 13), dir: "left", moving: false };
  s.desired = "left";
  s.brightness = 0;
  s.brightHold = 0;
  s.predators = roster(s.depth);
  s.playTime = 0;
  s.drifters = [];
  s.drifterIn = C.DRIFTER_INTERVAL;
  s.pulses = [];
  s.inkClouds = [];
  s.sonar.cooldown = 0;
  s.ink.cooldown = 0;
  s.lightMarks = s.lightMarks.map((r) => r.map(() => 0));
  s.pendingA = false;
  s.pendingB = false;
  enter(s, "countdown");
}
function start(s: FathomState, title = false) {
  const n = fresh(s.art, s.muted);
  n.titleIndex = s.titleIndex;
  n.simTime = s.simTime;
  n.accumulator = s.accumulator;
  enter(n, title ? "title" : "countdown");
  return n;
}
function confirm(s: FathomState): FathomState {
  const i = s.menuIndex;
  if (s.screen === "title") {
    s.titleIndex = i ?? 0;
    if (i === 0) return start(s);
    enter(s, "howto");
  } else if (s.screen === "paused") {
    if (i === 0) enter(s, "playing");
    else return start(s, i === 2);
  } else if (s.screen === "gameover") return start(s, i === 1);
  return s;
}
export function controls(
  state: ReadState,
  api: UpdateApi,
): { s: FathomState; held: boolean } {
  let s = copy(state);
  const input = api.input;
  if (input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();
  if (s.screen === "playing") {
    if (input.pressed("pause")) {
      enter(s, "paused");
      return { s, held: false };
    }
    const heldDirections = DIRS.filter((d) => input.value(d) > 0);
    const newlyHeld = heldDirections.filter(
      (d) => !s.heldDirections.includes(d),
    );
    if (newlyHeld.length) s.desired = newlyHeld[newlyHeld.length - 1];
    else if (heldDirections.length && !heldDirections.includes(s.desired))
      s.desired = heldDirections[heldDirections.length - 1];
    s.heldDirections = heldDirections;
    if (input.pressed("a")) s.pendingA = true;
    if (input.pressed("b")) s.pendingB = true;
    return { s, held: heldDirections.length > 0 };
  }
  if (
    s.screen === "paused" &&
    (input.pressed("pause") || input.pressed("back"))
  ) {
    enter(s, "playing");
    return { s, held: false };
  }
  if (s.screen === "howto") {
    let tapped = false;
    for (const p of input.pointerSamples())
      if (p.primary) {
        if (p.type === "down") s.pointerStart = { id: p.id, item: 0 };
        if (p.type === "up") {
          tapped = s.pointerStart?.id === p.id;
          s.pointerStart = null;
        }
      }
    if (input.pressed("confirm") || input.pressed("back") || tapped)
      s = start(s, true);
    return { s, held: false };
  }
  const items = menu(s);
  if (items.length) {
    if (input.pressed("up"))
      s.menuIndex = ((s.menuIndex ?? 0) + items.length - 1) % items.length;
    if (input.pressed("down"))
      s.menuIndex = ((s.menuIndex ?? 0) + 1) % items.length;
    let click = false;
    for (const p of input.pointerSamples())
      if (p.primary) {
        const i = items.findIndex((_, i) => {
          const r = menuRect(s, i);
          return (
            r !== null &&
            p.x >= r.x &&
            p.x < r.x + r.w &&
            p.y >= r.y &&
            p.y < r.y + r.h
          );
        });
        if (i >= 0) s.menuIndex = i;
        if (p.type === "down") s.pointerStart = { id: p.id, item: i };
        if (p.type === "up") {
          click =
            i >= 0 && s.pointerStart?.id === p.id && s.pointerStart.item === i;
          s.pointerStart = null;
        }
      }
    if (input.pressed("back")) {
      if (s.screen === "gameover") s = start(s, true);
    } else if (input.pressed("confirm") || click) s = confirm(s);
  }
  return { s, held: false };
}
export function tick(
  s: FathomState,
  held: boolean,
  cues: Set<C.CueName>,
): FathomState {
  s.simTime += C.TICK_DT;
  s.screenTime += C.TICK_DT;
  if (s.screen === "countdown") {
    reconcile(s);
    lighting(s);
    if (s.screenTime >= 2 - 1e-8) {
      s.playTime = 0;
      enter(s, "playing");
    }
    return s;
  }
  if (s.screen === "cleared") {
    if (s.screenTime >= 2 - 1e-8) {
      const n = fresh(s.art, s.muted);
      n.depth = s.depth + 1;
      n.score = s.score;
      n.lives = s.lives;
      n.titleIndex = s.titleIndex;
      n.simTime = s.simTime;
      n.accumulator = s.accumulator;
      n.predators = roster(n.depth);
      enter(n, "countdown");
      return reconcile(n);
    }
    return s;
  }
  if (s.screen !== "playing") return s;
  s.playTime += C.TICK_DT;
  s.sonar.cooldown = down(s.sonar.cooldown);
  s.ink.cooldown = down(s.ink.cooldown);
  const decay = Math.max(0, C.TICK_DT - s.brightHold);
  s.brightHold = down(s.brightHold);
  s.brightness *= 0.5 ** (decay / C.BRIGHT_HALFLIFE);
  s.lightMarks = s.lightMarks.map((r) => r.map((v) => down(v)));
  s.inkClouds = s.inkClouds
    .map((c) => ({ ...c, remaining: down(c.remaining) }))
    .filter((c) => c.remaining > 0);
  if (s.pendingA && s.sonar.cooldown === 0) {
    s.sonar.cooldown = C.SONAR_COOLDOWN;
    s.pulses.push({
      source: "forager",
      tint: "cyan",
      ox: s.forager.tx,
      oy: s.forager.ty,
      front: 0,
      range: s.sonar.range,
      owner: null,
      caught: false,
    });
    cues.add(C.CUES.sonar);
  }
  if (s.pendingB && s.ink.cooldown === 0) {
    s.ink.cooldown = C.INK_COOLDOWN;
    s.inkClouds.push({
      x: s.forager.x,
      y: s.forager.y,
      radius: C.INK_RADIUS,
      remaining: C.INK_LIFE,
    });
    cues.add(C.CUES.ink);
  }
  s.pendingA = false;
  s.pendingB = false;
  const f = s.forager;
  f.moving =
    held &&
    move(
      s,
      f,
      C.FORAGER_SPEED,
      () => {
        const opts = options(s, f);
        return opts.includes(s.desired)
          ? s.desired
          : opts.includes(f.dir)
            ? f.dir
            : null;
      },
      false,
      s.desired,
    );
  if (s.plankton[f.ty]?.[f.tx] === "*" && tile(s, f.tx, f.ty) === ".") {
    put(s.plankton, f.tx, f.ty, "-");
    s.planktonRemaining--;
    s.score += C.SCORE_PLANKTON;
    s.brightness = Math.min(1, s.brightness + C.BRIGHT_PER_EAT);
    s.brightHold = C.BRIGHT_HOLD;
    cues.add(C.CUES.eat);
    if (s.planktonRemaining === 0) {
      s.score += C.SCORE_CLEAR;
      enter(s, "cleared");
      cues.add(C.CUES.descend);
      reconcile(s);
      lighting(s);
      return s;
    }
  }
  reconcile(s);
  s.drifterIn = down(s.drifterIn);
  if (
    s.drifterIn === 0 &&
    s.planktonRemaining > 0 &&
    s.drifters.length < C.DRIFTER_MAX
  ) {
    const g = gate(s);
    if (g) {
      const exit = DIRS.map((d) => neighbor(s, g.tx, g.ty, d)).find((p) =>
        open(s, p.tx, p.ty),
      );
      if (exit) {
        s.drifters.push({
          ...center(exit.tx, exit.ty),
          dir: "up",
          lit: false,
          mind: true,
          travel: true,
        });
        s.drifterIn = C.DRIFTER_INTERVAL;
      }
    }
  }
  for (const b of s.drifters)
    if (b.mind && b.travel) move(s, b, C.DRIFTER_SPEED, () => wander(s, b));
  s.drifters = s.drifters.filter((b) => {
    if (same(b, f)) {
      s.score += C.SCORE_DRIFTER;
      return false;
    }
    return true;
  });
  for (let i = 0; i < s.predators.length; i++) {
    const p = s.predators[i];
    if (p.slot !== null && s.playTime >= p.slot * C.DEN_RELEASE_GAP)
      p.released = true;
    p.alertLeft = down(p.alertLeft);
    p.mark = down(p.mark);
    p.fade = down(p.fade);
    mind(s, p, i, cues);
  }
  pulses(s);
  reconcile(s);
  lighting(s);
  if (s.predators.some((p) => p.state !== "den" && same(p, f))) {
    cues.add(C.CUES.caught);
    if (s.lives === 0) enter(s, "gameover");
    else {
      s.lives--;
      attempt(s);
      reconcile(s);
    }
  }
  return s;
}
export function update(
  state: ReadState,
  api: UpdateApi,
  dt: number,
): FathomState {
  const c = controls(state, api);
  let s = c.s;
  s.accumulator += dt;
  while (s.accumulator + 1e-10 >= C.TICK_DT) {
    s.accumulator = Math.max(0, s.accumulator - C.TICK_DT);
    const cues = new Set<C.CueName>();
    s = tick(s, c.held, cues);
    cues.forEach((cue) => api.audio.play(cue));
  }
  return reconcile(s);
}
