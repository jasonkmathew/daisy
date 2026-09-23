# Developer notes (paused)

Where the project stands and ideas for picking it up again.

## Current state

- Anime cast, 4 stages, and Brawlhalla-style mechanics are in: dodges, 3 jumps,
  wall cling, ground pound and weapon drops.
- QWER combos, and a portrait HUD with a VS splash and cut-ins.
- `node tests/run-tests.js` passes (add `--shots` to save screenshots to
  `tests/screenshots/`).
- Electron (`npm start`) was checked under xvfb.

## Code map (quick reminders)

- Scripts load in the order listed in `index.html`, all under the global `SB`
  namespace. The game runs at a logical 1280x720 with a fixed 60 Hz step.
- Internal character ids are still the old ones: `blaze` = Kai, `aria` = Aoi,
  `titan` = Goro, `volt` = Hayate. Display names live in
  `src/game/characters.js`.
- The combo engine is `tryChain` / `pendingChain` in `src/game/fighter.js`.
  Link hits (knockback is capped mid-chain) are in `src/game/match.js`.
- Weapons:
  - `SB.WEAPONS` is defined in `src/game/items.js`.
  - Equip, throw and pickup live in `fighter.js`.
  - The extra blade hitboxes come from `hitboxesOf` in `match.js`.
- Walls: `moveAndCollide` sets `wallTouch` on solids unless `wall: false`, and
  the `'wall'` state in `fighter.js` uses it.
- Rendering:
  - Characters: `src/render/fighterRenderer.js`, with each fighter's look in
    `LOOKS`.
  - HUD, bloom, impact frames, VS splash and cut-in:
    `src/render/gameRenderer.js`.
- The dead Smash-era shield/ledge code paths still exist but are unused
  (`stage.ledges = []`, and Space maps to dodges). They could be removed.

## Known issues / rough edges

- Bloom costs about 6 ms/frame in software rendering (headless). It is cheap on
  a GPU, and players can switch it off in Settings.
- On the Combos screen, Kai's hair tip touches the top of his card.
- Hit sparks can briefly cover a fighter when there are many hits.
- The Final flash is bright. It is softened when "Impact frames" is off.

## Ideas for next time

1. More fighters (the roster/character-select layout assumes 4; it would need
   paging or a grid).
2. Signature weapon pairs per character, as in Brawlhalla (e.g. Aoi: katana +
   spear), with different movesets per weapon.
3. Online or local-network play (the fixed-timestep sim is deterministic enough
   to try rollback).
4. Remappable keys in Settings.
5. Gamepad rumble on heavy hits.
6. More stages, and a stage hazard toggle.
7. A 2v2 team mode with friendly-fire off.
8. Music tracks per stage (currently one synthesised menu/battle pair).
9. Remove the leftover shield/ledge code and rename the internal ids to match
   the new names.
