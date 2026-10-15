import type { RenderApi } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import {
  center,
  distance,
  flood,
  los,
  menu,
  menuRect,
  tile,
  DIRS,
  neighbor,
} from "./world";
import type { Direction, ReadState } from "./world";

export const BACKGROUND = "#03060c";
const CYAN = "#73f6de",
  WHITE = "#d9eee9",
  DIM = "#66868e",
  AMBER = "#ff9a63";
const FONT = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
type Context = CanvasRenderingContext2D;
function text(
  ctx: Context,
  value: string,
  x: number,
  y: number,
  size = 16,
  color = WHITE,
  align: CanvasTextAlign = "left",
) {
  ctx.font = `${size}px ${FONT}`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.fillText(value, x, y);
}
function line(
  ctx: Context,
  x: number,
  y: number,
  x2: number,
  y2: number,
  color = "#1a333d",
) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}
function circle(
  ctx: Context,
  x: number,
  y: number,
  r: number,
  color: string,
  fill = false,
) {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  if (fill) {
    ctx.fillStyle = color;
    ctx.fill();
  } else {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}
function glow(ctx: Context, x: number, y: number, r: number, color: string) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, color);
  g.addColorStop(1, "transparent");
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
}
function sprite(
  ctx: Context,
  s: ReadState,
  sheet: string,
  frame: number,
  x: number,
  y: number,
  size = C.TILE,
) {
  const image = s.art[sheet]?.[frame];
  if (image) ctx.drawImage(image, x - size / 2, y - size / 2, size, size);
}
const facing = (d: Direction) => ({ down: 0, up: 2, left: 4, right: 6 })[d];
function amber(ctx: Context, x: number, y: number) {
  glow(ctx, x, y, 20, "#fa814742");
  circle(ctx, x, y, 3, AMBER, true);
  circle(ctx, x, y, 1.2, "#ffe1a3", true);
}
function ground(
  ctx: Context,
  s: ReadState,
  view: { x: number; y: number; radius: number },
) {
  // The canvas clip is exact; these bounds only avoid blitting tiles that
  // cannot intersect it (especially the otherwise featureless fog tiles).
  const x0 = Math.max(
    0,
    Math.floor((view.x - view.radius - C.GRID_ORIGIN_X) / C.TILE),
  );
  const x1 = Math.min(
    C.GRID_COLS - 1,
    Math.floor((view.x + view.radius - C.GRID_ORIGIN_X) / C.TILE),
  );
  const y0 = Math.max(
    0,
    Math.floor((view.y - view.radius - C.GRID_ORIGIN_Y) / C.TILE),
  );
  const y1 = Math.min(
    C.GRID_ROWS - 1,
    Math.floor((view.y + view.radius - C.GRID_ORIGIN_Y) / C.TILE),
  );
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) {
      const v = s.visibility[y][x];
      if (v === "u") {
        const p = center(x, y);
        sprite(ctx, s, "trench-walls", 17, p.x, p.y);
        continue;
      }
      const t = tile(s, x, y);
      let frame = t === "g" ? 18 : 16;
      if (t === "#") {
        frame = 0;
        DIRS.forEach((d, i) => {
          const n = neighbor(s, x, y, d);
          if (tile(s, n.tx, n.ty) === "#") frame += 1 << i;
        });
      }
      const p = center(x, y);
      ctx.globalAlpha = v === "r" ? 0.26 : 1;
      sprite(ctx, s, "trench-walls", frame, p.x, p.y);
      if (s.plankton[y][x] === "*" && t === ".") {
        ctx.fillStyle = CYAN;
        ctx.shadowColor = CYAN;
        ctx.shadowBlur = v === "l" ? 8 : 0;
        circle(ctx, p.x, p.y, C.PLANKTON_DOT / 2, CYAN, true);
        ctx.shadowBlur = 0;
      }
    }
  ctx.globalAlpha = 1;
}
function mazeView(ctx: Context, s: ReadState) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  ctx.clip();
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(
    C.GRID_ORIGIN_X,
    C.GRID_ORIGIN_Y,
    C.GRID_COLS * C.TILE,
    C.GRID_ROWS * C.TILE,
  );
  ctx.save();
  circle(ctx, s.forager.x, s.forager.y, s.windowRadius, "transparent");
  ctx.clip();
  ground(ctx, s, { ...s.forager, radius: s.windowRadius });
  glow(ctx, s.forager.x, s.forager.y, s.windowRadius, "#2bcba917");
  for (const p of s.predators)
    if (p.kind === "lanternjaw" && p.state !== "den") amber(ctx, p.x, p.y);
  for (const d of s.drifters) amber(ctx, d.x, d.y);
  ctx.restore();
  for (const p of s.predators)
    if (p.flaring) {
      ctx.save();
      circle(ctx, p.x, p.y, C.FLARE_RADIUS, "transparent");
      ctx.clip();
      ground(ctx, s, { ...p, radius: C.FLARE_RADIUS });
      ctx.restore();
    }
  ctx.save();
  circle(ctx, s.forager.x, s.forager.y, s.windowRadius, "transparent");
  ctx.clip();
  for (const c of s.inkClouds) {
    ctx.globalAlpha = Math.min(1, c.remaining);
    glow(ctx, c.x, c.y, c.radius, "#000106");
    circle(ctx, c.x, c.y, c.radius * 0.8, "#010207dd", true);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  const beat = Math.floor(s.simTime * 8);
  for (const d of s.drifters)
    if (d.lit) sprite(ctx, s, "drifter", beat % 8, d.x, d.y);
  for (const p of s.predators) {
    if (p.lit && p.state !== "den") {
      const frame =
        p.kind === "lanternjaw" && p.state === "wander"
          ? 8 + (beat % 8)
          : facing(p.dir) + (Math.floor(s.simTime * 7) % 2);
      const passive =
        distance(p, s.forager) <= s.visionRadius && los(s, s.forager, p, true);
      const flare = s.predators.some(
        (h) => h.flaring && distance(h, p) <= C.FLARE_RADIUS,
      );
      if (p.mark > 0 && !passive && !flare && !p.alert)
        ctx.globalAlpha = Math.min(1, p.mark / C.SONAR_MARK_TIME);
      sprite(ctx, s, p.kind, frame, p.x, p.y);
      ctx.globalAlpha = 1;
    }
    if (p.alert) {
      const color = p.kind === "gloamfin" ? "#b69bff" : "#ffa36d";
      const t = 1 - p.alertLeft / C.ALERT_TIME;
      ctx.globalAlpha = 1 - t;
      circle(ctx, p.x, p.y, 18 + t * 28, color);
      for (let a = 0; a < 8; a++) {
        const angle = (a * Math.PI) / 4;
        line(
          ctx,
          p.x + Math.cos(angle) * 20,
          p.y + Math.sin(angle) * 20,
          p.x + Math.cos(angle) * (30 + t * 24),
          p.y + Math.sin(angle) * (30 + t * 24),
          color,
        );
      }
      ctx.globalAlpha = 1;
    }
    if (p.kind === "flarefish" && (p.flareAge >= 0 || p.fade > 0)) {
      const frame =
        p.fade > 0
          ? 6 + Math.min(1, Math.floor((0.3 - p.fade) / 0.15))
          : p.flareCharging
            ? Math.min(2, Math.floor((p.flareAge / C.FLARE_CHARGE) * 3))
            : 3 +
              Math.min(
                2,
                Math.floor(((p.flareAge - C.FLARE_CHARGE) / C.FLARE_BLOOM) * 3),
              );
      sprite(ctx, s, "flare-bloom", frame, p.x, p.y, C.FLARE_RADIUS * 2);
    }
  }
  for (const p of s.pulses) {
    const ds = flood(s, p.ox, p.oy, true),
      color =
        p.tint === "cyan" ? CYAN : p.tint === "violet" ? "#b29bff" : "#ff9c57";
    for (let y = 0; y < C.GRID_ROWS; y++)
      for (let x = 0; x < C.GRID_COLS; x++) {
        const d0 = ds[y][x];
        if (!Number.isFinite(d0) || d0 > p.front || d0 > p.range) continue;
        const c = center(x, y);
        for (const d of DIRS) {
          const n = neighbor(s, x, y, d),
            d1 = ds[n.ty]?.[n.tx];
          if (d1 !== d0 + 1 || d1 > p.range || Math.abs(n.tx - x) > 1) continue;
          const tail = Math.max(0, p.front - d0 - 1.1),
            head = Math.min(1, p.front - d0);
          if (tail >= head) continue;
          const to = center(n.tx, n.ty),
            dx = to.x - c.x,
            dy = to.y - c.y;
          ctx.globalAlpha = 0.8;
          ctx.strokeStyle = color;
          ctx.lineWidth = 4;
          ctx.shadowColor = color;
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.moveTo(c.x + dx * tail, c.y + dy * tail);
          ctx.lineTo(c.x + dx * head, c.y + dy * head);
          ctx.stroke();
          circle(ctx, c.x + dx * head, c.y + dy * head, 3, color, true);
        }
      }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
  glow(ctx, s.forager.x, s.forager.y, 36, "#64ffe552");
  sprite(
    ctx,
    s,
    "glimmerfin",
    facing(s.forager.dir) +
      (s.forager.moving ? Math.floor(s.simTime * 9) % 2 : 0),
    s.forager.x,
    s.forager.y,
  );
  ctx.restore();
  line(ctx, 64, 79, 1216, 79);
  line(ctx, 64, 657, 1216, 657);
  // Quiet bathymetric tick marks frame the darkness without exposing the maze.
  for (let y = 96; y < 650; y += 32) {
    line(ctx, 48, y, y % 128 === 96 ? 57 : 53, y, "#20404a");
    line(ctx, 1223, y, 1232, y, "#20404a");
  }
  text(ctx, "01", 32, 90, 10, DIM, "center");
  text(ctx, "18", 32, 652, 10, DIM, "center");
}
function gauge(
  ctx: Context,
  x: number,
  label: string,
  key: string,
  remaining: number,
  max: number,
  color: string,
) {
  text(ctx, label, x, 683, 13, color);
  text(ctx, key, x + 198, 683, 11, DIM, "right");
  ctx.fillStyle = "#11262e";
  ctx.fillRect(x, 695, 198, 3);
  ctx.fillStyle = color;
  ctx.fillRect(x, 695, 198 * Math.max(0, 1 - remaining / max), 3);
  text(
    ctx,
    remaining === 0 ? "READY" : `${remaining.toFixed(1)}s`,
    x + 244,
    698,
    11,
    remaining === 0 ? color : DIM,
    "right",
  );
}
function hud(ctx: Context, s: ReadState) {
  text(ctx, C.TITLE_TEXT, 64, 40, 25, CYAN);
  text(
    ctx,
    `${C.DIVE_LABEL} / DIVE ${String(s.depth).padStart(2, "0")}`,
    64,
    61,
    10,
    DIM,
  );
  text(ctx, "PLANKTON", 380, 31, 10, DIM);
  text(ctx, String(s.planktonRemaining).padStart(3, "0"), 380, 60, 24, WHITE);
  text(ctx, "BIOLUMINESCENCE", 570, 31, 10, DIM);
  for (let i = 0; i < 20; i++) {
    ctx.fillStyle = i / 20 < s.brightness ? CYAN : "#10232c";
    ctx.fillRect(570 + i * 8, 45, 5, 13);
  }
  text(ctx, "SCORE", 930, 29, 10, DIM, "right");
  text(ctx, String(s.score).padStart(6, "0"), 1216, 61, 48, WHITE, "right");
  text(ctx, `DEPTH ${s.depth}`, 64, 689, 16, WHITE);
  line(ctx, 180, 675, 180, 702);
  for (let i = 0; i < s.lives; i++)
    sprite(ctx, s, "glimmerfin", 6, 208 + i * 29, 686, 24);
  gauge(ctx, 360, "SONAR", "SPACE", s.sonar.cooldown, C.SONAR_COOLDOWN, CYAN);
  gauge(ctx, 687, "INK", "SHIFT", s.ink.cooldown, C.INK_COOLDOWN, "#99aed2");
  text(ctx, "P / PAUSE", 1216, 684, 11, DIM, "right");
  text(
    ctx,
    s.muted ? "M / SOUND OFF" : "M / SOUND ON",
    1216,
    704,
    10,
    DIM,
    "right",
  );
}
function ambience(ctx: Context) {
  for (let i = 0; i < 95; i++) {
    const x = (i * 313 + 73) % C.STAGE_W,
      y = (i * 137 + 29) % C.STAGE_H;
    circle(
      ctx,
      x,
      y,
      i % 5 === 0 ? 1.4 : 0.65,
      i % 4 === 0 ? "#4f9d9c45" : "#33516c32",
      true,
    );
  }
}
function footer(ctx: Context) {
  line(ctx, 64, 655, 1216, 655);
  text(ctx, "↑ ↓  SELECT     ENTER / SPACE  CONFIRM", 64, 688, 11, DIM);
  text(ctx, "M  SOUND     `  DIAGNOSTICS", 1216, 688, 11, DIM, "right");
}
function menuDraw(ctx: Context, s: ReadState) {
  menu(s).forEach((item, i) => {
    const r = menuRect(s, i);
    if (!r) return;
    const active = s.menuIndex === i;
    ctx.fillStyle = active ? "#103331" : "#081219";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = active ? "#4dbea3" : "#193039";
    ctx.lineWidth = 1;
    ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
    if (active) {
      ctx.fillStyle = CYAN;
      ctx.fillRect(r.x, r.y, 3, r.h);
      text(ctx, "›", r.x + 24, r.y + 33, 23, CYAN);
    }
    text(ctx, item, r.x + r.w / 2, r.y + 32, 17, active ? CYAN : DIM, "center");
    text(
      ctx,
      String(i + 1).padStart(2, "0"),
      r.x + r.w - 20,
      r.y + 30,
      10,
      active ? "#76ac9f" : "#33515a",
      "right",
    );
  });
}
function title(ctx: Context, s: ReadState) {
  ambience(ctx);
  // A restrained, editorial sonar chart around the title's living beacon.
  glow(ctx, 640, 300, 420, "#0d6a6028");
  for (const r of [96, 176, 256, 336]) circle(ctx, 640, 300, r, "#17383b");
  line(ctx, 250, 300, 1030, 300, "#16343a");
  line(ctx, 640, 70, 640, 632, "#16343a");
  ctx.save();
  ctx.globalAlpha = 0.15;
  for (let y = 2; y < 16; y++)
    for (let x = 1; x < 11; x++)
      if (tile(s, x, y) === "#") {
        sprite(ctx, s, "trench-walls", 0, 80 + x * 24, 140 + y * 24, 24);
        sprite(ctx, s, "trench-walls", 0, 1200 - x * 24, 140 + y * 24, 24);
      }
  ctx.restore();
  text(ctx, "F / 01", 64, 49, 14, CYAN);
  text(ctx, "ABYSSAL EXPEDITION", 1216, 49, 12, DIM, "right");
  text(ctx, "A BIOLUMINESCENT MAZE CHASE", 640, 167, 12, "#78a59e", "center");
  ctx.save();
  ctx.shadowColor = "#63f7cc";
  ctx.shadowBlur = 25;
  text(ctx, C.TITLE_TEXT, 640, 270, 116, WHITE, "center");
  ctx.restore();
  text(ctx, C.TAGLINE_TEXT.split("").join(" "), 640, 310, 17, CYAN, "center");
  glow(ctx, 640, 361, 36, "#4efcce55");
  sprite(ctx, s, "glimmerfin", 6, 640, 361);
  line(ctx, 552, 361, 596, 361, "#386963");
  line(ctx, 684, 361, 728, 361, "#386963");
  menuDraw(ctx, s);
  text(
    ctx,
    "YOUR LIGHT IS A LIFELINE. AND A LURE.",
    640,
    594,
    12,
    DIM,
    "center",
  );
  text(ctx, C.DIVE_LABEL, 64, 620, 10, "#3c676c");
  text(ctx, "36 × 18 / UNCHARTED WATER", 1216, 620, 10, "#3c676c", "right");
  footer(ctx);
}
function howto(ctx: Context, s: ReadState) {
  ambience(ctx);
  text(ctx, "FIELD GUIDE / 01", 64, 51, 12, CYAN);
  text(ctx, "READ THE DARK", 64, 119, 48, WHITE);
  text(
    ctx,
    "Eat to shine. Shine to see. But light draws hungry things.",
    64,
    158,
    16,
    DIM,
  );
  const cards = [
    {
      sheet: "lanternjaw",
      title: "LANTERNJAW",
      sense: "HUNTS YOUR LIGHT",
      color: AMBER,
      lines: [
        "A warm glimmer could be a gift.",
        "Or a mouth. Dim down and break",
        "its line of sight. Ink blinds it.",
      ],
    },
    {
      sheet: "gloamfin",
      title: "GLOAMFIN",
      sense: "HUNTS YOUR SOUND",
      color: "#b7a1ff",
      lines: [
        "Its violet ping listens for you.",
        "Your sonar gives you away, too.",
        "Round corners to lose its lead.",
      ],
    },
    {
      sheet: "flarefish",
      title: "FLAREFISH",
      sense: "HUNTS IN THE FLASH",
      color: "#ffad78",
      lines: [
        "A glow, then a sudden bloom.",
        "It sees straight through rock",
        "in the flash. Hide behind ink.",
      ],
    },
  ];
  cards.forEach((c, i) => {
    const x = 64 + i * 392;
    ctx.fillStyle = "#09151d";
    ctx.fillRect(x, 198, 368, 224);
    line(ctx, x, 198, x + 368, 198, c.color);
    sprite(ctx, s, c.sheet, 6, x + 35, 236, 40);
    text(ctx, c.title, x + 68, 230, 19, c.color);
    text(ctx, c.sense, x + 68, 252, 10, DIM);
    c.lines.forEach((l, j) => text(ctx, l, x + 23, 300 + j * 24, 14, WHITE));
  });
  text(ctx, "MOVE", 64, 474, 12, CYAN);
  text(ctx, "ARROWS / WASD", 64, 504, 22, WHITE);
  text(ctx, "Hold to swim. Release to stop.", 64, 534, 13, DIM);
  text(ctx, "SENSE", 456, 474, 12, CYAN);
  text(ctx, "SPACE / SONAR", 456, 504, 22, WHITE);
  text(ctx, "Sound bends around rock. Light does not.", 456, 534, 13, DIM);
  text(ctx, "SURVIVE", 848, 474, 12, CYAN);
  text(ctx, "SHIFT / INK", 848, 504, 22, WHITE);
  text(ctx, "P / ESC pause. M toggles sound.", 848, 534, 13, DIM);
  text(
    ctx,
    "Grazed corridors stay in memory, but only inside your growing light window.",
    64,
    582,
    14,
    "#86b6ac",
  );
  text(
    ctx,
    "Clear every plankton mote to descend. Three lives wait in reserve.",
    64,
    608,
    14,
    DIM,
  );
  line(ctx, 64, 655, 1216, 655);
  text(
    ctx,
    "ENTER / SPACE / ESC / CLICK  —  RETURN TO THE DEEP",
    640,
    688,
    12,
    CYAN,
    "center",
  );
}
export function render(s: ReadState, api: RenderApi) {
  const ctx = api.ctx;
  ctx.imageSmoothingEnabled = false;
  if (s.screen === "title") {
    title(ctx, s);
    return;
  }
  if (s.screen === "howto") {
    howto(ctx, s);
    return;
  }
  if (s.screen === "gameover") {
    ambience(ctx);
    glow(ctx, 640, 230, 290, "#75462925");
    text(ctx, "SIGNAL LOST", 640, 190, 55, WHITE, "center");
    text(ctx, "THE DEEP KEEPS WHAT IT CATCHES.", 640, 233, 13, AMBER, "center");
    text(ctx, String(s.score).padStart(6, "0"), 640, 326, 64, CYAN, "center");
    text(ctx, `FINAL SCORE  /  DEPTH ${s.depth}`, 640, 363, 13, DIM, "center");
    menuDraw(ctx, s);
    footer(ctx);
    return;
  }
  mazeView(ctx, s);
  hud(ctx, s);
  if (s.screen === "playing") return;
  if (s.screen === "paused") {
    ctx.fillStyle = "#03060cba";
    ctx.fillRect(190, 170, 900, 450);
    text(ctx, "DIVE SUSPENDED", 640, 292, 42, WHITE, "center");
    text(ctx, "THE WATER HOLDS ITS BREATH.", 640, 333, 12, DIM, "center");
    menuDraw(ctx, s);
  } else if (s.screen === "countdown") {
    ctx.fillStyle = "#03060cbd";
    ctx.fillRect(480, 270, 320, 180);
    text(ctx, "DIVE", 640, 330, 34, CYAN, "center");
    text(
      ctx,
      String(Math.max(1, Math.ceil(2 - s.screenTime))).padStart(2, "0"),
      640,
      402,
      54,
      WHITE,
      "center",
    );
  } else if (s.screen === "cleared") {
    ctx.fillStyle = "#03060cdd";
    ctx.fillRect(320, 254, 640, 210);
    text(ctx, `DEPTH ${s.depth} CLEARED`, 640, 326, 36, CYAN, "center");
    text(
      ctx,
      `+${C.SCORE_CLEAR}  /  DESCENDING`,
      640,
      379,
      17,
      WHITE,
      "center",
    );
    text(ctx, "THERE IS ALWAYS DEEPER WATER.", 640, 422, 12, DIM, "center");
  }
}
