# Caravan — project context for Claude

Read this first: it replaces the history of the original build conversation.

## What this is
The Fallout: New Vegas "Caravan" card game as a static PWA (plain HTML/CSS/JS, no build step,
no backend). Owner plays it on iPhone as a home-screen app.

- **Live URL (permanent, do not change):** https://scavenger221.github.io/caravan/
- **Hosting:** GitHub Pages from this repo's `main` branch, root path.
- **Deploy = commit + `git push`.** Nothing else.

## Hard rules
- All currency (caps) is in-game only. Never add real-money anything.
- Cache busting is MANUAL: `index.html` loads `style.css?v=N` and `game.js?v=N`, and `sw.js`
  has matching `CACHE = 'caravan-vN'` + versioned ASSETS list. **Bump all three together on
  every change**, or players get stale files.
- No external assets except the Trystero ESM import (loaded on demand for multiplayer).
  Sounds are WebAudio-generated in code; the icon is local.
- Keep it playable in portrait AND landscape, and offline (service worker).

## Architecture (all in 3 files)
- `index.html` — every screen as a `.screen` div (menu, bet, game, decks, challenges,
  leaderboard, settings, rules slides, online) + overlays (result, name picker, log).
- `style.css` — 5 themes via `body[data-theme=...]` CSS vars: vegas (default), neon (Pip-Boy),
  midnight, royal, light.
- `game.js` — everything else:
  - Save: localStorage key `caravan_save_v1`, migrated in `migrateCollection()`.
  - Engine: `newMatch/applyMove/legalTargets/checkGameEnd`; caravans are `{cards:[{card,kings,queens[],joker}],dir}`.
  - AI: `aiTakeTurn` scores every legal move by simulating it on a board clone
    (`cloneCvs/applyToCvs/evalPosition`); difficulty = chance of a random move (easy .45 / normal .08 / hard 0).
  - Collection/decks: cards owned by key `"rank:suit"`; 3 deck presets, min 30 cards;
    rewards from wins + 7 challenges; XP/levels (`awardXP`, `xpNeeded`).
  - Multiplayer: `Net` module over Trystero (WebRTC, signaling via public relays — serverless).
    Host/join with 6-char codes + Quick Match lobby auto-pairing. Both clients run the engine
    in lockstep; only moves are transmitted; guest mirrors sides (p↔a). Friendly matches only
    (no caps/XP) so the economy can't be farmed.
  - Sign-in: Google/Apple wired but dormant until `AUTH` ids are configured (see README).

## History / decisions that matter
- Design went from ornate → minimal flat; NO emojis in UI (suit glyphs ♠♥♦♣, ★ joker are fine).
- Card faces: corner rank+suit indices (mirrored), single center pip; serif letters for J/Q/K.
  Multi-pip layouts were tried and REMOVED — unreadable at small sizes.
- Play targets: the entire caravan region highlights solid orange (`.caravan.targetable`) —
  no dashed boxes, no "play here" text.
- Disband: labeled per-caravan button, two-tap confirm ("Disband" → "Sure?") — never use
  browser `confirm()` for game actions (works badly in the PWA).
- Deck must have ≥30 cards; bet screen preselects the last-used deck.
- Pass & Play existed and was REMOVED in favor of online P2P. Don't re-add it unless asked.
- PeerJS cloud was tried and REPLACED by Trystero (broker was unreliable).
- Owner's GitHub: Scavenger221. gh CLI is authenticated on the home PC (keyring).

## bloxorz/ — separate mini-app
- `bloxorz/` is a self-contained Bloxorz-style block-rolling puzzle PWA (portrait-only),
  same no-build philosophy. Once on `main` it lives at
  https://scavenger221.github.io/caravan/bloxorz/.
- It has its OWN cache busting, independent of caravan's: `bloxorz/index.html` loads
  `style.css?v=N` + `game.js?v=N`, and `bloxorz/sw.js` has matching `CACHE='bloxorz-vN'`
  + versioned ASSETS. Bump all together on every bloxorz change.
- `bloxorz/game.js` keeps the engine DOM-free: under node it exports
  `{LEVELS, DIRS, initState, tryMove, cloneState}` so levels can be BFS-verified solvable.
  Any new/edited level MUST pass such a solver before shipping.
- Mechanics: 1x1x2 block rolls; fragile `o` tiles break under a standing block; soft
  (a-d, any contact) / hard (A-D, standing only) switches drive bridge groups 1-4;
  `T` splits the block into two cubes that rejoin when adjacent; win = standing on `G`.

## Testing without a device
Serve locally (`python -m http.server`), then drive the game from the console: the engine and
DOM are all global (`G`, `save`, `legalTargets`, `applyMove`...). An auto-play loop that picks
the first legal move each turn finishes a full match and shakes out most regressions.
