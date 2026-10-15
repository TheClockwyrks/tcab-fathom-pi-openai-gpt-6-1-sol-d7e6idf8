import type { Game } from "@clockwyrks/simple-2d";
import * as C from "./constants";
import { debug } from "./debug";
import type { FathomDebugApi } from "./debug";
import { BACKGROUND, render } from "./render";
import { update } from "./simulation";
import { fresh } from "./world";
import type { FathomState } from "./world";

export type { FathomDebugApi } from "./debug";
export type {
  FathomState,
  Body,
  Direction,
  Drifter,
  InkCloud,
  Predator,
  PredatorState,
  Pulse,
  Screen,
} from "./world";
export { BACKGROUND };

export const game: Game<FathomState, FathomDebugApi> = {
  async initialize(api) {
    for (const action of C.ACTIONS)
      api.input.register(action, { keys: [...C.BINDINGS[action]] });
    const sounds = [
      { freq: 640, freqTo: 900, durationMs: 65, gain: 0.06 },
      { freq: 1050, freqTo: 240, durationMs: 300, gain: 0.1 },
      { freq: 120, freqTo: 45, durationMs: 320, gain: 0.14 },
      { freq: 380, freqTo: 640, durationMs: 250, gain: 0.09 },
      { freq: 170, freqTo: 1200, durationMs: 420, gain: 0.1 },
      { freq: 260, freqTo: 42, durationMs: 550, gain: 0.15 },
      { freq: 480, freqTo: 1100, durationMs: 600, gain: 0.12 },
    ];
    Object.values(C.CUES).forEach((cue, i) =>
      api.audio.define(cue, {
        ...sounds[i],
        wave: i === 2 ? "triangle" : "sine",
      }),
    );
    for (const name of [
      "screen",
      "depth",
      "score",
      "lives",
      "brightness",
      "visionRadius",
      "windowRadius",
      "planktonRemaining",
    ] as const)
      api.diagnostics.register(name, (s) => s[name]);
    api.diagnostics.register(
      "cooldowns",
      (s) =>
        `sonar ${s.sonar.cooldown.toFixed(2)} / ink ${s.ink.cooldown.toFixed(2)}`,
    );
    api.diagnostics.register(
      "forager",
      (s) => `${s.forager.tx},${s.forager.ty} ${s.forager.dir}`,
    );
    for (let i = 0; i < C.DEN_ORDER.length * C.ROSTER_CAP; i++)
      api.diagnostics.register(`hunter ${i + 1}`, (s) => {
        const p = s.predators[i];
        return p
          ? `${p.kind} ${p.state} ${p.tx},${p.ty} ${p.speed.toFixed(1)} alert:${p.alert}`
          : "—";
      });
    const sheets: [string, number][] = [
      ["glimmerfin", 8],
      ["lanternjaw", 16],
      ["gloamfin", 8],
      ["flarefish", 8],
      ["drifter", 8],
      ["flare-bloom", 8],
      ["trench-walls", 19],
    ];
    const entries = await Promise.all(
      sheets.map(
        async ([name, count]) =>
          [
            name,
            await Promise.all(
              Array.from({ length: count }, (_, i) =>
                api.assets.loadImage(`${name}/${i}.png`),
              ),
            ),
          ] as const,
      ),
    );
    return [fresh(Object.fromEntries(entries)), debug];
  },
  update,
  render,
};
