# Caravan — Card Game

The Fallout: New Vegas Caravan card game as a web app, playable on any phone or desktop.
**All currency is in-game caps — there is no way to spend real money.**

## Features
- Full Caravan rules: 3 caravans, sell at 21–26, direction/suit rules, Jack / Queen / King / Joker effects, setup phase, discard, and disband.
- Caps economy: start with 250 caps, bet 10–100 per match, winner takes the pot. Go broke and the house stakes you 50.
- AI opponent with named Mojave characters.
- Leaderboard with your wins, losses, and best streak.
- Dark / light theme, custom player name, progress saved locally.
- Works in portrait **and** landscape.

## Run the web preview
Serve the folder with any static server, e.g.:

```
cd Caravan
python -m http.server 8080
```

Then open http://localhost:8080

## Install on iPhone (no App Store needed)
1. Host the folder anywhere (GitHub Pages, Netlify, etc.) or serve it on your LAN.
2. Open the URL in **Safari** on the iPhone.
3. Tap **Share → Add to Home Screen**.
4. It launches fullscreen like a native app, works in both orientations, and saves progress on the device.

## Online multiplayer (peer-to-peer, no game server)
Menu → Online Multiplayer. One player **hosts** and gets a 6-character code; the other **joins** with it.
The WebRTC handshake is brokered over public relays (Trystero — BitTorrent/Nostr), then all game
traffic flows directly between the two players. Friendly matches: no caps, no card rewards.
Requires internet on both sides.

## Sign-in providers
The buttons are wired in Settings → Account; they activate once you register the (free) credentials:
- **Google**: create an OAuth *Web application* client at console.cloud.google.com, put the client ID
  in `AUTH.googleClientId` at the top of `game.js`, and host the game on the authorized domain.
- **Apple**: needs an Apple Developer account — create a *Services ID* with Sign in with Apple,
  put it in `AUTH.appleServiceId`, and serve over HTTPS from the registered domain.
- **Game Center**: no web API exists — it works only in the native iOS build
  (add `@capgo/capacitor-game-center` after `npx cap add ios`).

## Build a real iOS app (needs a Mac with Xcode)
The game is a plain static web app, so wrapping it with Capacitor is straightforward:

```
npm install @capacitor/core @capacitor/cli
npx cap init Caravan com.fahad.caravan --web-dir .
npx cap add ios
npx cap open ios     # builds & signs in Xcode
```

No code changes are required — localStorage, touch input, and both orientations already work inside the Capacitor web view.
