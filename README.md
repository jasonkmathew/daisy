# Brawl Legends

A Smash-style 2D platform fighter for the desktop, built around **QWER combos**.
Move with the arrow keys, crouch with Shift, and chain Q, W, E and R attacks into
named combos. Knock your opponents off the stage: the more damage they take, the
farther they fly.

![Title](docs/title.png)
![Gameplay](docs/gameplay.png)
![Combos](docs/combos.png)

## Features

- **4 fighters**, each with a full moveset: jab combos, tilts, dash attack,
  charged smash attacks, 5 aerials, grabs + pummel + 4 throws, 4 special moves
  and a cinematic **Final Smash**.
  - **Blaze** – fire brawler (fireballs, blazing dash punch, explosive burst)
  - **Aria** – swordswoman (sword beam, multi-slash dash, spinning recovery, counter)
  - **Titan** – stone heavyweight (chargeable punch, super-armoured charge, earthquake stomp)
  - **Volt** – storm ninja (triple jump, shurikens, teleports, lightning strike)
- **4 stages** with animated parallax backgrounds: Sky Temple, Final Frontier,
  Volcano Keep (moving platform, lava sea) and Neon Skydeck (flying shuttle platform).
- Smash-style mechanics: damage % and knockback scaling, hitlag, DI, hitstun and
  tumble, shields (with shield breaks), rolls, spot/air dodges, ledge grabbing and
  ledge options, teching, fast-falling, drop-through platforms, clanks, super
  armour, counters, move staleness, projectiles and multi-hit moves.
- **Items**: healing hearts, throwable bombs and the rainbow **Smash Orb** that
  unlocks your Final Smash.
- **Up to 4 players**: two keyboard layouts plus up to four gamepads, with CPU
  opponents at levels 1–9.
- Stock and timed matches, a **training mode** (with combo counter), pause menu and
  a results screen with stats.
- Procedurally drawn cel-shaded characters (skeletal animation, hair/scarf physics,
  swoosh trails), particle effects, screen shake and synthesised sound effects and music.
  No external assets required.

## Running it

**Desktop app (Electron):**

```bash
npm install
npm start
```

To build an installer for your OS: `npm run dist` (output in `dist/`).

**In a browser:** just open `index.html`, or run `npm run web` and visit
<http://localhost:8080>.

Press **F11** for fullscreen.

## Controls

| Action           | Keyboard A    | Keyboard B            | Gamepad            |
| ---------------- | ------------- | --------------------- | ------------------ |
| Move             | Arrow keys    | Num 4 5 6 / J K L     | Left stick / D-pad |
| Jump             | Up arrow      | Num 8 / I             | X                  |
| Crouch           | Shift         | Num 2 / M             | Stick down / L3    |
| **Q** Light attack | Q           | Num 7 / U             | A                  |
| **W** Heavy / smash | W          | Num 9 / O             | Y / right stick    |
| **E** Special    | E             | Num 1 / P             | B                  |
| **R** Grab       | R             | Num 3 / `[`           | RB                 |
| Shield / dodge   | Space         | Num 0 / N             | LB / LT / RT       |
| Pause            | Esc           | Esc                   | Start              |

- Direction + Q = tilt attacks (in the air: aerials). Shift + Q = low sweep.
- Direction + W = smash attacks (hold W to charge).
- Direction + E = four different specials. **Up + E** is your recovery.
- Space + left/right = roll, Space in the air = air dodge, tap Space just before
  landing while tumbling to **tech**. Shift or Down in the air = fast fall.
- R grabs, then a direction throws (Q to pummel).
- Break the Smash Orb, then press E for your Final Smash.

## QWER combos

When a hit **lands**, press the next key to cancel into another attack. Chains go
from light to heavy to special: **Q → W → E**. The same move can only be used once
per chain. Hits in the middle of a chain keep the opponent close, so the next hit
connects. Presses made slightly early are queued, so mashing works too.

These key strings are **named combos** with their own finishing moves:

| Keys      | Blaze           | Aria          | Titan         | Volt          |
| --------- | --------------- | ------------- | ------------- | ------------- |
| Q Q W     | Rising Flame    | Sky Cutter    | Boulder Upper | Static Lift   |
| Q W E     | Inferno Knuckle | Azure Tempest | Avalanche     | Thunder Rush  |
| Q Q Q Q   | Flame Flurry    | Blade Storm   | Rock Barrage  | Spark Flurry  |

- **Launcher** (Q Q W) knocks the opponent upward so you can jump and keep going with aerials.
- **Finisher** (Q W E) is a big move with its own animation and extra impact.
- **Flurry** (Q Q Q Q) is a string of rapid hits ending in a push.

A combo counter above your HUD panel shows hits and total damage. The **COMBOS**
menu lists every fighter's combos, and training mode shows a cheat sheet on screen.
CPU opponents use combos too, more often at higher levels.

## Tests

```bash
npm test                     # needs the `playwright` package
node tests/run-tests.js --shots   # also saves screenshots to tests/screenshots/
node tests/pose-sheet.js     # renders every pose/attack frame with hitboxes
```

The test suite loads the game in headless Chromium, walks through the menus,
simulates 16 full four-player CPU matches (every stage × every character), and
checks every named QWER combo at several input speeds, every move, knockback scaling, shields, grabs/throws, recovery, Final
Smashes, items, time/training modes, keyboard input mapping and CPU difficulty
scaling.

## Project layout

```
index.html            entry page (loads the scripts below)
electron/main.js      desktop window wrapper
src/core/             math utils, input (keyboard/gamepad/mouse), audio synth
src/game/             skeleton rig, moves, characters, fighter physics & state
                      machine, stages, projectiles, items, final smashes, AI, match
src/render/           fighter renderer and match/HUD renderer
src/ui/               menu widgets and screens
tests/                automated tests
```
