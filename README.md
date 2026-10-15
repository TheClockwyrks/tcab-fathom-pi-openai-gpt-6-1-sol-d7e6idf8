# Fathom

**Hunt in the dark.** A browser-only, bioluminescent maze chase. Graze plankton to grow your light, trace the corridors with sonar, and evade three hunters that track light, sound, and the flash of their own flare.

This is the **Kindle** dive: explored terrain stays in memory, but even remembered ground goes dark beyond the circular window you carry. Eat to widen the window. Clear the maze to descend into more crowded water.

## Run

Requires Node.js 22.12+ (or a current compatible LTS) and npm.

```sh
npm ci
npm run dev
```

Open the local URL Vite prints. The game runs entirely on the canvas; it needs no backend, account, downloaded font, or external service.

## Build and serve

```sh
npm run build
npm run preview
```

The complete static site is in `dist/`, including `index.html` and all art. Serve that directory at a server root or under a sub-path. Asset URLs are relative to the page. No manual copying or extra production step is required.

## Controls

| Control | Action |
| --- | --- |
| Arrow keys / WASD, held | Swim; release to stop |
| Space | Sonar, with a 1.5-second cooldown |
| Shift | Ink, with an 8-second cooldown |
| P / Escape | Pause or resume |
| M | Toggle sound |
| Up / Down | Select a menu item |
| Enter / Space | Confirm |
| Escape | Back |
| Backtick | Engine diagnostics |

Menus also accept pointer and touch. Touch devices get the engine’s on-screen directional pad and action buttons.

Your light stops at rock; sonar follows corridors. Amber glimmers can be harmless drifters or disguised Lanternjaws. Gloamfins hear through ink, so use corners to shake them. A charging Flarefish is about to reveal a much larger disc of the maze. Ink blinds the hunters that see, but never makes you invulnerable.

Plankton pay 10 points, drifters 200, and clearing a maze 500. Three lives are held in reserve in addition to your current attempt. Losing a life preserves your score, explored terrain, and eaten plankton.

## Checks

```sh
npm run typecheck
npm run lint
npm run format
npm test
```

The unit suite runs the real Simple 2D engine over a Node canvas and counted clocks. It covers frame-rate-independent movement, wrap crossings and turns, the screen machine and pointer menus, memory and occlusion, resources, scoring, den releases, and all three hunting senses. Tests and coverage reports are written into the ignored `coverage/` directory.

## Source map

- `src/game.ts`: engine registration, synthesized audio, assets, diagnostics, and public types.
- `src/world.ts`: state values, maze, grid movement, line of sight, and shortest-path fields.
- `src/simulation.ts`: 120 Hz simulation, screens, creatures, sound fronts, fog, and encounters.
- `src/debug.ts`: immutable, validated poses and JSON snapshots, available only through `engine.debug`.
- `src/render.ts`: pixel-art compositing, circular memory window, effects, screens, and HUD.
- `showcase/`: player description, screenshots, and a four-second engine-recorded replay.

All evolving simulation data belongs to the engine-held state. Update and debug poses construct new values; rendering and diagnostics only read them. The renderer never supplies simulation data. Image resources load through the engine, and the engine owns input, audio, timing, canvas fit, recording, and the diagnostic overlay.

To reproduce the showcase, run the dev server and then `node scripts/capture-showcase.mjs`. The capture script uses a private engine and the same debug poses a test uses; it adds no globals to the shipped game.
