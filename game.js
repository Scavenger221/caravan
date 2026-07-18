/* =====================================================================
   CARAVAN — Fallout: New Vegas card game
   Pure in-game currency (caps). No purchases.
   ===================================================================== */
'use strict';

/* ---------------- Persistence ---------------- */
const SAVE_KEY = 'caravan_save_v1';
const DEFAULT_SAVE = {
  caps: 250,
  name: 'Courier',
  nameChosen: false,
  theme: 'vegas',
  anim: true,
  sound: true,
  music: true,
  haptics: true,
  difficulty: 'normal',
  wins: 0, losses: 0, streak: 0, bestStreak: 0, bestCaps: 250,
};
const THEMES = [
  { id: 'vegas',    name: 'New Vegas', bg: '#131118', accent: '#ff9e3d' },
  { id: 'neon',     name: 'Pip-Boy',   bg: '#060c07', accent: '#3dff77' },
  { id: 'midnight', name: 'Midnight',  bg: '#0e1116', accent: '#64a8e8' },
  { id: 'royal',    name: 'Royal',     bg: '#120f1a', accent: '#c9a95c' },
  { id: 'light',    name: 'Paper',     bg: '#f1efe9', accent: '#b3782f' },
];
/* ---- collection: cards are owned by key "rank:suit", e.g. "13:♥", joker "14:★" ---- */
const SUIT_LIST = ['♠', '♥', '♦', '♣'];
const ALL_KEYS = (() => {
  const k = [];
  for (const s of SUIT_LIST) for (let r = 1; r <= 13; r++) k.push(r + ':' + s);
  k.push('14:★');
  return k;
})();
function starterCollection() {
  const c = {};
  for (const k of ALL_KEYS) c[k] = k === '14:★' ? 0 : 1;
  return c;
}
function keyRank(k) { return parseInt(k, 10); }
function keySuit(k) { return k.split(':')[1]; }
function keyLabel(k) { const r = keyRank(k); return r === 14 ? '★' : rankLabel(r) + keySuit(k); }
function deckSize(d) { return Object.values(d.cards).reduce((a, b) => a + b, 0); }
const MIN_DECK = 30;

let save = loadSave();
function loadSave() {
  try {
    const s = JSON.parse(localStorage.getItem(SAVE_KEY));
    if (s && typeof s.caps === 'number') {
      const merged = Object.assign({}, DEFAULT_SAVE, s);
      if (merged.theme === 'dark') merged.theme = 'vegas'; // migrate old theme
      if (!THEMES.some(t => t.id === merged.theme)) merged.theme = 'vegas';
      return migrateCollection(merged);
    }
  } catch (e) {}
  return migrateCollection(Object.assign({}, DEFAULT_SAVE));
}
function migrateCollection(s) {
  if (!s.collection) s.collection = starterCollection();
  if (!s.decks || !Array.isArray(s.decks) || s.decks.length !== 3) {
    s.decks = [
      { name: 'Deck 1', cards: Object.assign({}, s.collection) },
      { name: 'Deck 2', cards: {} },
      { name: 'Deck 3', cards: {} },
    ];
  }
  if (typeof s.activeDeck !== 'number' || s.activeDeck < 0 || s.activeDeck > 2) s.activeDeck = 0;
  s.progress = Object.assign({ matches: 0, jacks: 0, sold26: false, wonBet100: false }, s.progress || {});
  s.claimed = s.claimed || {};
  if (typeof s.xp !== 'number') s.xp = 0;
  if (typeof s.level !== 'number') s.level = 1;
  if (typeof s.rating !== 'number') s.rating = 1000;
  if (!Array.isArray(s.circuitLog)) s.circuitLog = [];
  if (s.lbSeen === undefined) s.lbSeen = null;
  return s;
}
function persist() {
  save.bestCaps = Math.max(save.bestCaps, save.caps);
  localStorage.setItem(SAVE_KEY, JSON.stringify(save));
}

/* ---------------- Audio (WebAudio, no files) ---------------- */
const Sound = (() => {
  let ctx = null, sfxGain = null, musicGain = null, musicTimer = null, booted = false;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      sfxGain = ctx.createGain(); sfxGain.gain.value = 0.5; sfxGain.connect(ctx.destination);
      musicGain = ctx.createGain(); musicGain.gain.value = 0.14; musicGain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }
  function tone(freq, dur, type, dest, delay, peak) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak || 0.3, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest || sfxGain);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function thud(dur, cutoff, delay, peak) { // filtered noise burst: card sounds
    const t = ctx.currentTime + (delay || 0);
    const len = Math.ceil(ctx.sampleRate * dur);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff || 1800;
    const g = ctx.createGain(); g.gain.value = peak || 0.35;
    src.connect(f); f.connect(g); g.connect(sfxGain);
    src.start(t);
  }
  const recipes = {
    select: () => tone(760, 0.06, 'triangle', sfxGain, 0, 0.16),
    play:   () => { thud(0.06, 2200, 0, 0.4); tone(190, 0.09, 'sine', sfxGain, 0.01, 0.22); },
    deal:   () => { for (let i = 0; i < 5; i++) thud(0.045, 2600, i * 0.07, 0.25); },
    remove: () => { tone(320, 0.16, 'sawtooth', sfxGain, 0, 0.18); tone(160, 0.22, 'sawtooth', sfxGain, 0.06, 0.15); },
    coin:   () => { tone(1319, 0.08, 'square', sfxGain, 0, 0.12); tone(1760, 0.16, 'square', sfxGain, 0.06, 0.12); },
    win:    () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.24, 'triangle', sfxGain, i * 0.11, 0.22)),
    lose:   () => [392, 330, 262].forEach((f, i) => tone(f, 0.3, 'triangle', sfxGain, i * 0.16, 0.18)),
  };
  function sfx(name) {
    if (!save.sound) return;
    try { if (ensure() && recipes[name]) recipes[name](); } catch (e) {}
  }
  // ambient loop: slow pentatonic notes over a low drone
  const SCALE = [220, 261.63, 293.66, 329.63, 392, 440];
  function musicTick() {
    try {
      const f = SCALE[Math.floor(Math.random() * SCALE.length)] * (Math.random() < 0.3 ? 0.5 : 1);
      tone(f, 2.2, 'sine', musicGain, 0, 0.5);
      if (Math.random() < 0.35) tone(f * 1.5, 2.6, 'sine', musicGain, 0.5, 0.25);
      if (Math.random() < 0.2) tone(110, 3.5, 'sine', musicGain, 0, 0.35);
    } catch (e) {}
  }
  function startMusic() { if (!ensure() || musicTimer) return; musicTick(); musicTimer = setInterval(musicTick, 1600); }
  function stopMusic() { clearInterval(musicTimer); musicTimer = null; }
  window.addEventListener('pointerdown', () => { // browsers require a gesture to start audio
    if (!booted) { booted = true; if (save.music) startMusic(); }
    else if (ctx && ctx.state === 'suspended') ctx.resume();
  });
  return { sfx, startMusic, stopMusic };
})();
function haptic(ms) {
  if (save.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) {} }
}

/* ---------------- Cards ---------------- */
const SUITS = ['♠', '♥', '♦', '♣'];
const RED = { '♥': true, '♦': true };
const RANK_NAME = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K', 14: '★' }; // 14 = joker
function rankLabel(r) { return RANK_NAME[r] || String(r); }
let cardId = 0;
function shuffle(d) {
  for (let i = d.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [d[i], d[j]] = [d[j], d[i]];
  }
  return d;
}
function makeDeck() {
  const d = [];
  for (const s of SUITS) for (let r = 1; r <= 13; r++) d.push({ id: ++cardId, rank: r, suit: s });
  d.push({ id: ++cardId, rank: 14, suit: '★' });
  d.push({ id: ++cardId, rank: 14, suit: '★' });
  return shuffle(d);
}
function buildPlayerDeck() {
  const preset = save.decks[save.activeDeck];
  const d = [];
  for (const [k, n] of Object.entries(preset.cards)) {
    for (let i = 0; i < n; i++) d.push({ id: ++cardId, rank: keyRank(k), suit: keySuit(k) });
  }
  return shuffle(d);
}
const isNumber = c => c.rank >= 1 && c.rank <= 10;

function cardDesc(c) {
  if (c.rank === 11) return '<b>Jack</b> — removes the card it lands on, along with everything attached to it.';
  if (c.rank === 12) return '<b>Queen</b> — play on a caravan\'s top card: flips its direction and takes her suit.';
  if (c.rank === 13) return '<b>King</b> — doubles the card it lands on. Kings stack.';
  if (c.rank === 14) return '<b>Joker</b> — on an Ace: wipes that suit from the table. On 2–10: wipes that value everywhere.';
  return `<b>${rankLabel(c.rank)}${c.suit}</b> — worth ${c.rank} on one of your caravans.`;
}

/* ---------------- Game state ---------------- */
let G = null; // current match

function newMatch(bet) {
  const rivalIdx = pendingRival != null ? pendingRival : pickRival();
  pendingRival = null;
  G = {
    bet,
    mode: 'ai', // 'ai' | 'online'
    rival: rivalIdx,             // index into RIVALS (Mojave Circuit)
    rivalEps: rivalEps(rivalIdx),
    oppName: RIVALS[rivalIdx].name,
    deck: { p: buildPlayerDeck(), a: makeDeck() },
    hand: { p: [], a: [] },
    cvs: { p: [newCv(), newCv(), newCv()], a: [newCv(), newCv(), newCv()] },
    turn: 'p',
    setupLeft: { p: 3, a: 3 },
    over: false,
    selected: null,      // hand index
    discardArmed: false,
    busy: false,
    log: [],
    moveNo: 0,
  };
  for (let i = 0; i < 8; i++) { G.hand.p.push(G.deck.p.pop()); G.hand.a.push(G.deck.a.pop()); }
}
function newCv() { return { cards: [], dir: 0 }; } // dir: 0 none, 1 asc, -1 desc
// slot: { card, kings: 0, queens: [suits], joker: false }

function cvValue(cv) {
  return cv.cards.reduce((s, sl) => s + sl.card.rank * Math.pow(2, sl.kings), 0);
}
function cvSuit(cv) {
  if (!cv.cards.length) return null;
  const last = cv.cards[cv.cards.length - 1];
  return last.queens.length ? last.queens[last.queens.length - 1] : last.card.suit;
}
function recomputeDir(cv) {
  const n = cv.cards.length;
  if (n < 2) { cv.dir = 0; return; }
  const a = cv.cards[n - 2].card.rank, b = cv.cards[n - 1].card.rank;
  cv.dir = b > a ? 1 : b < a ? -1 : 0;
  // queens on the last card flip direction
  if (cv.dir !== 0 && cv.cards[n - 1].queens.length % 2 === 1) cv.dir = -cv.dir;
}
const isSold = v => v >= 21 && v <= 26;

/* ---------------- Legality ---------------- */
// Returns list of legal targets for card c held by `who`.
// Target: { kind:'caravan', side, i }  (number/queen append)
//         { kind:'slot', side, i, s }  (jack/king/joker on a specific card)
function legalTargets(who, c) {
  const t = [];
  const setup = G.setupLeft[who] > 0;
  if (isNumber(c)) {
    for (let i = 0; i < 3; i++) {
      const cv = G.cvs[who][i];
      if (setup) {
        if (cv.cards.length === 0) t.push({ kind: 'caravan', side: who, i });
        continue;
      }
      if (canPlayNumber(cv, c)) t.push({ kind: 'caravan', side: who, i });
    }
    return t;
  }
  if (setup) return []; // no face cards during your setup
  const sides = ['p', 'a'];
  if (c.rank === 12) { // queen: last card of any caravan
    for (const side of sides) for (let i = 0; i < 3; i++) {
      const cv = G.cvs[side][i];
      if (cv.cards.length) t.push({ kind: 'slot', side, i, s: cv.cards.length - 1 });
    }
    return t;
  }
  // jack, king, joker: any placed number card
  for (const side of sides) for (let i = 0; i < 3; i++) {
    const cv = G.cvs[side][i];
    for (let s = 0; s < cv.cards.length; s++) {
      if (c.rank === 14 && cv.cards[s].joker) continue; // one joker per card
      t.push({ kind: 'slot', side, i, s });
    }
  }
  return t;
}
function canPlayNumber(cv, c) {
  const n = cv.cards.length;
  if (n === 0) return true;
  const last = cv.cards[n - 1].card;
  if (c.rank === last.rank) return false;
  if (n === 1 || cv.dir === 0) return true;
  if (c.suit === cvSuit(cv)) return true;
  return cv.dir === 1 ? c.rank > last.rank : c.rank < last.rank;
}

/* ---------------- Applying moves ---------------- */
function applyMove(who, handIdx, target) {
  const c = G.hand[who][handIdx];
  G.hand[who].splice(handIdx, 1);
  let drew = true;

  if (isNumber(c)) {
    const cv = G.cvs[target.side][target.i];
    cv.cards.push({ card: c, kings: 0, queens: [], joker: false });
    recomputeDir(cv);
    if (G.setupLeft[who] > 0) { G.setupLeft[who]--; drew = false; }
  } else if (c.rank === 12) { // queen
    const cv = G.cvs[target.side][target.i];
    cv.cards[target.s].queens.push(c.suit);
    recomputeDir(cv);
  } else if (c.rank === 13) { // king
    G.cvs[target.side][target.i].cards[target.s].kings++;
  } else if (c.rank === 11) { // jack
    const cv = G.cvs[target.side][target.i];
    cv.cards.splice(target.s, 1);
    recomputeDir(cv);
  } else { // joker
    const cv = G.cvs[target.side][target.i];
    const sl = cv.cards[target.s];
    sl.joker = true;
    const tc = sl.card;
    for (const side of ['p', 'a']) for (const c2 of G.cvs[side]) {
      c2.cards = c2.cards.filter(x =>
        x === sl ||
        (tc.rank === 1 ? x.card.suit !== tc.suit : x.card.rank !== tc.rank)
      );
      recomputeDir(c2);
    }
  }
  if (drew && G.deck[who].length && G.hand[who].length < 5) G.hand[who].push(G.deck[who].pop());
  return c;
}
function discard(who, handIdx) {
  const c = G.hand[who].splice(handIdx, 1)[0];
  if (G.deck[who].length && G.hand[who].length < 5) G.hand[who].push(G.deck[who].pop());
  return c;
}
function disband(who, i) {
  G.cvs[who][i] = newCv();
}

/* ---------------- Rewards & challenges ---------------- */
function rewardWeight(k) {
  const r = keyRank(k);
  if (r === 14) return 1;              // joker: rare
  if (r === 12) return 3;              // queen
  if (r === 11 || r === 13) return 4;  // jack, king
  if (r === 1) return 6;               // ace
  return 8;                            // numbers: common
}
function grantCards(keys) {
  for (const k of keys) save.collection[k] = (save.collection[k] || 0) + 1;
}
function grantRandomCards(n) {
  const pool = [];
  for (const k of ALL_KEYS) for (let i = 0; i < rewardWeight(k); i++) pool.push(k);
  const won = [];
  for (let i = 0; i < n; i++) won.push(pool[Math.floor(Math.random() * pool.length)]);
  grantCards(won);
  return won;
}
const CHALLENGES = [
  { id: 'first_win',  name: 'First Blood',     desc: 'Win your first match',        target: 1,   get: s => s.wins,                       reward: ['14:★'] },
  { id: 'streak3',    name: 'On a Roll',       desc: 'Win 3 matches in a row',      target: 3,   get: s => s.bestStreak,                 reward: ['13:♠', '13:♥'] },
  { id: 'sold26',     name: 'Perfect Caravan', desc: 'Sell a caravan at exactly 26',target: 1,   get: s => s.progress.sold26 ? 1 : 0,    reward: ['10:♠', '10:♥'] },
  { id: 'jacks5',     name: 'Hitman',          desc: 'Play 5 Jacks',                target: 5,   get: s => s.progress.jacks,             reward: ['11:♣', '11:♦'] },
  { id: 'matches10',  name: 'Regular',         desc: 'Play 10 matches',             target: 10,  get: s => s.progress.matches,           reward: { random: 4 } },
  { id: 'high_roller',name: 'High Roller',     desc: 'Win a 100-cap match',         target: 1,   get: s => s.progress.wonBet100 ? 1 : 0, reward: ['14:★'] },
  { id: 'caps500',    name: 'Money Talks',     desc: 'Hold 500 caps at once',       target: 500, get: s => s.bestCaps,                   reward: ['12:♥', '12:♦'] },
];
function checkChallenges() {
  const done = [];
  for (const c of CHALLENGES) {
    if (save.claimed[c.id]) continue;
    if (c.get(save) >= c.target) {
      save.claimed[c.id] = true;
      const keys = Array.isArray(c.reward) ? (grantCards(c.reward), c.reward.slice()) : grantRandomCards(c.reward.random);
      done.push({ name: c.name, keys });
    }
  }
  return done;
}
/* --- leveling --- */
function xpNeeded(level) { return 80 + (level - 1) * 40; }
function awardXP(amount) {
  save.xp += amount;
  const ups = [];
  while (save.xp >= xpNeeded(save.level)) {
    save.xp -= xpNeeded(save.level);
    save.level++;
    save.caps += 50;
    const keys = grantRandomCards(2);
    if (save.level % 5 === 0) { grantCards(['14:★']); keys.push('14:★'); }
    ups.push({ level: save.level, keys });
  }
  return ups;
}

function rewardChipsHTML(keys) {
  return keys.map(k => {
    const r = keyRank(k), s = keySuit(k);
    const cls = r === 14 ? ' purple' : (RED[s] ? ' red' : '');
    return `<span class="rw-chip${cls}">${keyLabel(k)}</span>`;
  }).join('');
}

/* ---------------- Win detection ---------------- */
// Lane winner: 'p' | 'a' | null (undecided)
function laneWinner(i) {
  const vp = cvValue(G.cvs.p[i]), va = cvValue(G.cvs.a[i]);
  const sp = isSold(vp), sa = isSold(va);
  if (sp && sa) return vp === va ? null : (vp > va ? 'p' : 'a');
  if (sp) return 'p';
  if (sa) return 'a';
  return null;
}
function checkGameEnd() {
  const winners = [0, 1, 2].map(laneWinner);
  if (winners.every(w => w !== null)) {
    const pWins = winners.filter(w => w === 'p').length;
    return pWins >= 2 ? 'p' : 'a';
  }
  // out of cards = loss
  if (!G.hand.p.length && !G.deck.p.length) return 'a';
  if (!G.hand.a.length && !G.deck.a.length) return 'p';
  return null;
}

/* ---------------- AI ---------------- */
function aiTakeTurn() {
  const hand = G.hand.a;
  let best = null; // {score, type, handIdx, target}
  const all = [];

  const consider = (score, type, handIdx, target) => {
    score += Math.random() * 0.5; // tie-break jitter
    const m = { score, type, handIdx, target };
    all.push(m);
    if (!best || score > best.score) best = m;
  };

  for (let h = 0; h < hand.length; h++) {
    const c = hand[h];
    for (const t of legalTargets('a', c)) {
      consider(scoreAiMove(c, t), 'play', h, t);
    }
  }
  // discard fallback: dump least useful card
  if (hand.length) {
    let worst = 0;
    for (let h = 1; h < hand.length; h++) {
      if (cardUtility(hand[h]) < cardUtility(hand[worst])) worst = h;
    }
    consider(-3, 'discard', worst, null); // discarding beats actively bad moves only
  }
  // disband an overburdened caravan: score it like any other move
  if (G.setupLeft.a === 0) {
    for (let i = 0; i < 3; i++) {
      if (cvValue(G.cvs.a[i]) > 26) {
        const sim = cloneCvs(G.cvs);
        sim.a[i] = { cards: [], dir: 0 };
        consider(evalPosition(sim, 'a') - evalPosition(G.cvs, 'a') - 2, 'disband', -1, { i });
      }
    }
  }

  if (!best) return null;
  // blunder rate: the rival's circuit rating sets the base, the difficulty
  // setting adds forgiveness on top (easy makes everyone sloppier)
  const diffAdj = { easy: 0.25, normal: 0.05, hard: 0 }[save.difficulty] || 0;
  const eps = G.rivalEps != null
    ? Math.min(0.6, G.rivalEps + diffAdj)
    : ({ easy: 0.45, normal: 0.08, hard: 0 }[save.difficulty] || 0);
  if (eps && Math.random() < eps && all.length > 1) best = all[Math.floor(Math.random() * all.length)];
  if (best.type === 'play') {
    const c = G.hand.a[best.handIdx];
    const t = best.target;
    applyMove('a', best.handIdx, t);
    return describeAiMove(c, t);
  }
  if (best.type === 'disband') { disband('a', best.target.i); return `${G.oppName} disbands a caravan.`; }
  discard('a', best.handIdx);
  return `${G.oppName} discards a card.`;
}
function cardUtility(c) {
  if (c.rank === 11 || c.rank === 14) return 8; // jacks/jokers precious
  if (c.rank === 13) return 7;
  if (c.rank === 12) return 2;
  return c.rank >= 6 ? 6 : 4;
}
/* --- simulation-based evaluation: clone the board, apply the move, score the position --- */
function cloneCvs(cvs) { return JSON.parse(JSON.stringify(cvs)); }
function applyToCvs(cvs, c, t) { // board-only effects of a move (no hands/decks)
  const cv = cvs[t.side][t.i];
  if (isNumber(c)) {
    cv.cards.push({ card: { rank: c.rank, suit: c.suit }, kings: 0, queens: [], joker: false });
    recomputeDir(cv);
  } else if (c.rank === 12) {
    cv.cards[t.s].queens.push(c.suit);
    recomputeDir(cv);
  } else if (c.rank === 13) {
    cv.cards[t.s].kings++;
  } else if (c.rank === 11) {
    cv.cards.splice(t.s, 1);
    recomputeDir(cv);
  } else { // joker
    const sl = cv.cards[t.s];
    sl.joker = true;
    const tc = sl.card;
    for (const side of ['p', 'a']) for (const c2 of cvs[side]) {
      c2.cards = c2.cards.filter(x =>
        x === sl || (tc.rank === 1 ? x.card.suit !== tc.suit : x.card.rank !== tc.rank));
      recomputeDir(c2);
    }
  }
}
function evalPosition(cvs, me) { // higher = better for `me`
  const opp = me === 'p' ? 'a' : 'p';
  let score = 0, won = 0, lost = 0;
  for (let i = 0; i < 3; i++) {
    const mv = cvValue(cvs[me][i]), ov = cvValue(cvs[opp][i]);
    const ms = isSold(mv), os = isSold(ov);
    if (ms && (!os || mv > ov)) { score += 100 + mv; won++; }
    else if (os && (!ms || ov > mv)) { score -= 100 + ov; lost++; }
    if (!ms) score += mv <= 26 ? mv * 2 : -34 - (mv - 26) * 2; // progress vs overburden
    if (!os) score -= ov <= 26 ? ov * 2 : -20;                 // their overburden helps me
  }
  if (won >= 2) score += 400;  // one lane from victory
  if (lost >= 2) score -= 450; // must break their lanes NOW
  return score;
}
function cardCost(c) { // spending a strong card should need a payoff
  if (c.rank === 14) return 12;
  if (c.rank === 11) return 9;
  if (c.rank === 13) return 7;
  if (c.rank === 12) return 4;
  return 1;
}
function scoreAiMove(c, t) {
  if (G.setupLeft.a > 0 && isNumber(c)) return 10 - c.rank * 0.15; // setup: get low cards down first
  const sim = cloneCvs(G.cvs);
  applyToCvs(sim, c, t);
  const gain = evalPosition(sim, 'a') - evalPosition(G.cvs, 'a');
  return gain - cardCost(c);
}
function describeAiMove(c, t) {
  const whose = t.side === 'a' ? 'their' : 'your';
  const lane = t.i + 1;
  if (isNumber(c)) return `${G.oppName} plays <b>${rankLabel(c.rank)}${c.suit}</b> on their caravan ${lane}.`;
  const names = { 11: 'Jack', 12: 'Queen', 13: 'King', 14: 'Joker' };
  return `${G.oppName} plays a <b>${names[c.rank]}</b> on ${whose} caravan ${lane}.`;
}

/* ---------------- DOM helpers ---------------- */
const $ = id => document.getElementById(id);
function show(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  $(screenId).classList.add('active');
}

/* ---------------- Menu / navigation ---------------- */
function refreshMenu() {
  $('menu-caps').textContent = save.caps;
  $('level-num').textContent = 'Lv ' + save.level;
  $('xp-label').textContent = save.xp + ' / ' + xpNeeded(save.level) + ' XP';
  $('xp-fill').style.width = Math.min(100, Math.round(save.xp / xpNeeded(save.level) * 100)) + '%';
  const ev = circuit().events[0];
  $('menu-ticker').innerHTML = `#${myRank()} on the circuit · ${rankTitle(save.rating)}`
    + (ev ? ` — <b>${RIVALS[ev.w].name}</b> beat ${RIVALS[ev.l].name} ${agoLabel(ev.at)}` : '');
}
$('btn-play').onclick = () => openBetScreen();
$('btn-leaderboard').onclick = () => { renderLeaderboard(); show('screen-leaderboard'); };
$('btn-rules').onclick = () => { rulesReturn = 'screen-menu'; show('screen-rules'); };
$('btn-settings').onclick = () => { renderSettings(); show('screen-settings'); };
$('btn-lb-back').onclick = () => { refreshMenu(); show('screen-menu'); };
$('btn-settings-back').onclick = () => { refreshMenu(); show('screen-menu'); };
let rulesReturn = 'screen-menu';
$('btn-rules-back').onclick = () => show(rulesReturn);
$('btn-help').onclick = () => { rulesReturn = 'screen-game'; show('screen-rules'); };

/* ---------------- Bet screen ---------------- */
const BETS = [10, 25, 50, 100];
let chosenBet = 10;
let pendingRival = null; // RIVALS index picked on the bet screen (or by call-out)
function renderBetOpp() {
  const i = pendingRival;
  const c = circuit();
  const rank = ladder().findIndex(x => !x.me && x.i === i) + 1;
  const marked = i === markedRival();
  const above = c.r[i] > save.rating;
  $('bet-opp').innerHTML = `
    <span class="bo-name">${RIVALS[i].name}</span>
    <span class="bo-sub">#${rank} on the circuit · rating ${c.r[i]}</span>
    ${marked ? '<span class="bo-bounty">Marked today — win pays a 2× caps bounty</span>'
      : above ? '<span class="bo-bounty">Ranked above you — win pays a caps bounty</span>' : ''}
    <button class="btn small btn-ghost" id="btn-reroll">Different opponent</button>`;
  $('btn-reroll').onclick = () => { pendingRival = pickRival(pendingRival); renderBetOpp(); };
}
function openBetScreen(rival) {
  if (save.caps < BETS[0]) {
    save.caps = 50; // house stake
    persist();
    alert("You're broke! The house stakes you 50 caps. Don't lose it all again.");
  }
  $('bet-caps').textContent = save.caps;
  const box = $('bet-options');
  box.innerHTML = '';
  chosenBet = 0;
  for (const b of BETS) {
    const btn = document.createElement('button');
    btn.className = 'bet-opt';
    btn.innerHTML = `${b} ◉<small>caps</small>`;
    btn.disabled = save.caps < b;
    btn.onclick = () => {
      chosenBet = b;
      box.querySelectorAll('.bet-opt').forEach(x => x.classList.remove('selected'));
      btn.classList.add('selected');
    };
    box.appendChild(btn);
    if (!chosenBet && !btn.disabled) { chosenBet = b; btn.classList.add('selected'); }
  }
  // remember the last-used deck: preselect it so one tap on Deal starts the match
  deckChosen = deckSize(save.decks[save.activeDeck]) >= MIN_DECK;
  if (!deckChosen) {
    const ok = save.decks.findIndex(d => deckSize(d) >= MIN_DECK);
    if (ok >= 0) { save.activeDeck = ok; deckChosen = true; }
  }
  renderDeckSelect();
  pendingRival = rival != null ? rival : (pendingRival != null ? pendingRival : pickRival());
  renderBetOpp();
  show('screen-bet');
}
let deckChosen = false; // must actively pick a deck every time
function renderDeckSelect() {
  const wrap = $('deck-select');
  wrap.innerHTML = '';
  save.decks.forEach((d, i) => {
    const size = deckSize(d);
    const b = document.createElement('button');
    b.className = 'deck-opt' + (deckChosen && i === save.activeDeck ? ' selected' : '');
    b.disabled = size < MIN_DECK;
    b.innerHTML = `${d.name}<small>${size < MIN_DECK ? size + ' cards — too small' : size + ' cards'}</small>`;
    b.onclick = () => { save.activeDeck = i; deckChosen = true; persist(); renderDeckSelect(); };
    wrap.appendChild(b);
  });
  $('btn-start-match').disabled = !deckChosen || deckSize(save.decks[save.activeDeck]) < MIN_DECK;
}
$('btn-bet-back').onclick = () => { pendingRival = null; refreshMenu(); show('screen-menu'); };
$('btn-start-match').onclick = () => {
  if (!chosenBet) return;
  startMatch(chosenBet);
};

/* ---------------- Match flow ---------------- */
function startMatch(bet) {
  newMatch(bet);
  lastMode = 'ai';
  $('opp-name').textContent = G.oppName;
  $('pot-amount').textContent = bet * 2;
  addLog(`Match vs <b>${G.oppName}</b> — ${bet} caps each, pot ${bet * 2}.`);
  setMessage('Setup: play a number card on each of your three caravans.');
  Sound.sfx('deal');
  show('screen-game');
  renderAll();
}

/* ---------------- Online multiplayer (P2P over WebRTC via PeerJS) ----------------
   The host creates a short game code; the guest joins with it. After the WebRTC
   handshake, all game traffic flows peer-to-peer. Both clients run the same
   deterministic engine in lockstep: the host deals, sends the initial state, and
   from then on each side only transmits its moves. Friendly matches — no caps. */
let lastMode = 'ai';
const Net = (() => {
  // Transport: Trystero — WebRTC signaling over public relays (BitTorrent/Nostr),
  // so there is no dedicated matchmaking server at all.
  let room = null, tx = null, connected = false;
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  async function lib() {
    if (!window.__trystero) window.__trystero = await import('https://cdn.jsdelivr.net/npm/trystero@0.21.5/+esm');
    return window.__trystero;
  }
  async function open(code, onStatus, hosting) {
    close();
    try {
      const { joinRoom } = await lib();
      room = joinRoom({ appId: 'caravan-fnv-cardgame' }, 'match-' + code.toUpperCase().trim());
      const [sendMsg, onMsg] = room.makeAction('msg');
      tx = sendMsg;
      onMsg(data => onData(data));
      room.onPeerJoin(() => {
        if (connected) return; // 2-player game: ignore extras
        connected = true;
        onStatus('connected');
        if (!hosting) send({ t: 'hello', name: save.name });
      });
      room.onPeerLeave(() => { if (connected) { connected = false; onDrop(); } });
      onStatus(hosting ? 'waiting' : 'searching', code);
    } catch (e) { onStatus('error', 'network'); }
  }
  function host(onStatus) { open(newCode(), onStatus, true); }
  function join(code, onStatus) { open(code, onStatus, false); }
  // Quick Match: everyone searching sits in a shared lobby room; the first two
  // peers to see each other derive the same private room code from their ids
  // (still fully peer-to-peer — the lobby is just another relay room).
  let lobby = null;
  async function quick(onStatus) {
    close();
    try {
      const { joinRoom, selfId } = await lib();
      lobby = joinRoom({ appId: 'caravan-fnv-cardgame' }, 'quickmatch-lobby');
      let matched = false;
      lobby.onPeerJoin(peerId => {
        if (matched) return;
        matched = true;
        const pair = [selfId, peerId].sort();
        let h = 0;
        for (const ch of pair.join('')) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
        const code = 'QM' + h.toString(36).toUpperCase().slice(0, 4).padStart(4, '0');
        const hosting = selfId === pair[0];
        try { lobby.leave(); } catch (e) {}
        lobby = null;
        open(code, onStatus, hosting);
      });
      onStatus('searching');
    } catch (e) { onStatus('error', 'network'); }
  }
  function leaveLobby() { try { if (lobby) lobby.leave(); } catch (e) {} lobby = null; }
  function send(o) { try { if (tx) tx(o); } catch (e) {} }
  function close() { try { if (room) room.leave(); } catch (e) {} room = null; tx = null; connected = false; }
  function ready() { return true; } // library loads on demand
  function active() { return connected; }
  return { ready, host, join, quick, leaveLobby, send, close, active };
})();

function snapshotG() { // host → guest initial state
  return JSON.parse(JSON.stringify({ deck: G.deck, hand: G.hand, cvs: G.cvs, setupLeft: G.setupLeft }));
}
function startOnlineHost(guestName) {
  newMatch(0);
  G.mode = 'online';
  lastMode = 'online';
  G.deck = { p: makeDeck(), a: makeDeck() }; // both sides play a standard deck
  G.hand = { p: [], a: [] };
  for (let i = 0; i < 8; i++) { G.hand.p.push(G.deck.p.pop()); G.hand.a.push(G.deck.a.pop()); }
  G.oppName = guestName || 'Opponent';
  Net.send({ t: 'init', state: snapshotG(), name: save.name });
  enterOnlineGame(true);
}
function startOnlineGuest(state, hostName) {
  newMatch(0);
  G.mode = 'online';
  lastMode = 'online';
  // mirror the host's state: their 'p' is our 'a'
  G.deck = { p: state.deck.a, a: state.deck.p };
  G.hand = { p: state.hand.a, a: state.hand.p };
  G.cvs = { p: state.cvs.a, a: state.cvs.p };
  G.setupLeft = { p: state.setupLeft.a, a: state.setupLeft.p };
  G.turn = 'a'; // host moves first
  G.oppName = hostName || 'Host';
  enterOnlineGame(false);
}
function enterOnlineGame(isHost) {
  $('opp-name').textContent = G.oppName;
  $('pot-amount').textContent = '—';
  addLog(`Online match vs <b>${G.oppName}</b> — friendly, no caps.`);
  setMessage(isHost ? 'You go first. Setup: play a number card on each caravan.' : `${G.oppName} goes first.`);
  Sound.sfx('deal');
  show('screen-game');
  renderAll();
}
const flipSide = s => (s === 'p' ? 'a' : 'p');
function onRemoteMove(m) {
  if (!G || G.over || G.mode !== 'online') return;
  let desc = '';
  if (m.kind === 'play') {
    const t = m.target.kind === 'caravan'
      ? { kind: 'caravan', side: flipSide(m.target.side), i: m.target.i }
      : { kind: 'slot', side: flipSide(m.target.side), i: m.target.i, s: m.target.s };
    const c = applyMove('a', m.handIdx, t);
    desc = `${G.oppName} plays <b>${c.rank === 14 ? 'a Joker' : rankLabel(c.rank) + c.suit}</b>.`;
    Sound.sfx(c.rank === 11 || c.rank === 14 ? 'remove' : 'play');
  } else if (m.kind === 'discard') {
    discard('a', m.handIdx);
    desc = `${G.oppName} discards a card.`;
  } else if (m.kind === 'disband') {
    disband('a', m.i);
    desc = `${G.oppName} disbands a caravan.`;
  }
  addLog(desc); setMessage(desc);
  renderAll();
  const w = checkGameEnd();
  if (w) { endOnlineMatch(w); return; }
  G.turn = 'p';
  renderAll();
}
function onData(msg) {
  if (!msg || !msg.t) return;
  if (msg.t === 'hello') startOnlineHost(msg.name);       // host side: guest arrived
  else if (msg.t === 'init') startOnlineGuest(msg.state, msg.name); // guest side
  else if (msg.t === 'move') onRemoteMove(msg);
  else if (msg.t === 'bye') onDrop();
}
function onDrop() {
  if (G && G.mode === 'online' && !G.over) {
    G.over = true;
    setMessage('<b>Connection lost.</b> Match ended.');
    $('result-title').textContent = 'Disconnected';
    $('result-detail').textContent = 'The connection to your opponent was lost.';
    $('result-caps').textContent = ''; $('result-caps').className = 'result-caps';
    $('result-rewards').innerHTML = '';
    $('overlay-result').classList.add('active');
  }
  Net.close();
}
function endOnlineMatch(winnerSide) {
  G.over = true;
  const won = winnerSide === 'p';
  addLog(won ? '<b>You win</b> the match.' : `<b>${G.oppName} wins</b> the match.`);
  Sound.sfx(won ? 'win' : 'lose');
  haptic(won ? [30, 40, 30] : 60);
  $('result-title').textContent = won ? 'You Win' : G.oppName + ' Wins';
  $('result-detail').textContent = 'Online match — friendly, no caps at stake.';
  $('result-caps').textContent = ''; $('result-caps').className = 'result-caps';
  $('result-rewards').innerHTML = '';
  renderAll();
  setTimeout(() => $('overlay-result').classList.add('active'), 600);
}

/* --- online screen UI --- */
function resetOnlineScreen() {
  $('online-choice').hidden = false;
  $('online-host').hidden = true;
  $('online-join').hidden = true;
  $('online-quick').hidden = true;
  $('join-status').textContent = '';
  $('host-status').textContent = 'Share this code with your friend and wait…';
  $('game-code').textContent = '······';
}
$('btn-quickmatch').onclick = () => {
  $('online-choice').hidden = true;
  $('online-quick').hidden = false;
  $('quick-status').textContent = 'Searching for an opponent…';
  Net.quick((status, extra) => {
    if (status === 'searching') $('quick-status').textContent = 'Searching for an opponent…';
    else if (status === 'waiting' || status === 'connected') $('quick-status').textContent = 'Opponent found — connecting…';
    else if (status === 'error') $('quick-status').textContent = 'Connection error (' + extra + '). Go back and retry.';
  });
};
$('btn-online').onclick = () => {
  if (!navigator.onLine) { alert('Online play needs an internet connection.'); return; }
  resetOnlineScreen();
  show('screen-online');
};
$('btn-online-back').onclick = () => { Net.leaveLobby(); Net.close(); refreshMenu(); show('screen-menu'); };
$('btn-host').onclick = () => {
  $('online-choice').hidden = true;
  $('online-host').hidden = false;
  Net.host((status, extra) => {
    if (status === 'waiting') $('game-code').textContent = extra;
    else if (status === 'connected') $('host-status').textContent = 'Friend connected — dealing…';
    else if (status === 'error') $('host-status').textContent = 'Connection error (' + extra + '). Go back and retry.';
  });
};
$('btn-join').onclick = () => {
  $('online-choice').hidden = true;
  $('online-join').hidden = false;
  $('join-code').focus();
};
$('btn-join-go').onclick = () => {
  const code = $('join-code').value.trim();
  if (code.length !== 6) { $('join-status').textContent = 'Enter the 6-character code.'; return; }
  $('join-status').textContent = 'Connecting…';
  Net.join(code, (status, extra) => {
    if (status === 'searching') $('join-status').textContent = 'Looking for the host…';
    else if (status === 'connected') $('join-status').textContent = 'Connected — waiting for the deal…';
    else if (status === 'error') $('join-status').textContent = 'Connection error (' + extra + '). Check your internet and the code.';
  });
};

/* ---------------- Game log ---------------- */
function addLog(html) {
  if (!G) return;
  G.moveNo++;
  G.log.push({ n: G.moveNo, html });
  if ($('overlay-log').classList.contains('active')) renderLog();
}
function renderLog() {
  const list = $('log-list');
  if (!G || !G.log.length) { list.innerHTML = '<div class="log-empty">Nothing yet.</div>'; return; }
  list.innerHTML = G.log.map(e =>
    `<div class="log-entry"><span class="log-turn">${e.n}</span><span>${e.html}</span></div>`).join('');
  list.scrollTop = list.scrollHeight;
}
$('btn-log').onclick = () => { renderLog(); $('overlay-log').classList.add('active'); };
$('btn-log-close').onclick = () => $('overlay-log').classList.remove('active');
$('btn-quit').onclick = () => {
  if (!G || G.over) { Net.close(); show('screen-menu'); refreshMenu(); return; }
  if (G.mode === 'online') {
    if (confirm('Leave the online match?')) {
      Net.send({ t: 'bye' });
      G.over = true;
      Net.close();
      refreshMenu(); show('screen-menu');
    }
    return;
  }
  if (confirm('Forfeit the match and lose your bet?')) endMatch('a', 'You forfeited the match.');
};
$('btn-rematch').onclick = () => {
  $('overlay-result').classList.remove('active');
  if (lastMode === 'online') { Net.close(); resetOnlineScreen(); show('screen-online'); }
  else openBetScreen(G ? G.rival : null); // rematch the same rival
};
$('btn-result-menu').onclick = () => { $('overlay-result').classList.remove('active'); refreshMenu(); show('screen-menu'); };

function endMatch(winner, detail) {
  G.over = true;
  const won = winner === 'p';
  addLog(won ? `<b>You win</b> the pot (+${G.bet} caps).` : `<b>${G.oppName} wins</b> the pot (−${G.bet} caps).`);
  save.progress.matches++;
  if (won) {
    save.caps += G.bet;
    save.wins++; save.streak++;
    save.bestStreak = Math.max(save.bestStreak, save.streak);
    if (G.bet >= 100) save.progress.wonBet100 = true;
  } else {
    save.caps -= G.bet;
    save.losses++; save.streak = 0;
  }
  // Mojave Circuit: Elo-style rating swing, plus a caps bounty for upsets
  let ratingDelta = 0, bounty = 0, newRank = 0;
  if (G.rival != null) {
    const rr = circuit().r[G.rival], pr = save.rating;
    const exp = 1 / (1 + Math.pow(10, (rr - pr) / 400));
    ratingDelta = Math.round(32 * ((won ? 1 : 0) - exp)) || (won ? 1 : -1);
    if (won) { bounty = bountyFor(G.rival, G.bet); save.caps += bounty; }
    save.rating = Math.max(600, pr + ratingDelta);
    newRank = myRank();
    save.circuitLog = [{
      at: Date.now(),
      txt: won ? `<b>You</b> beat ${RIVALS[G.rival].name} <i>+${ratingDelta}</i>`
               : `${RIVALS[G.rival].name} beat <b>you</b> <i>${ratingDelta}</i>`,
    }].concat(save.circuitLog || []).slice(0, 6);
  }
  const cardKeys = won ? grantRandomCards(save.streak >= 3 ? 3 : 2) : [];
  const completed = checkChallenges();
  const xpGain = (won ? 90 + G.bet : 30) + completed.length * 60;
  const ups = awardXP(xpGain);
  persist();
  let rw = `<div class="rw-block"><span class="rw-title">+${xpGain} XP</span></div>`;
  if (G.rival != null) {
    rw += `<div class="rw-block"><span class="rw-title">Rating ${ratingDelta >= 0 ? '+' : ''}${ratingDelta} → #${newRank} · ${rankTitle(save.rating)}</span></div>`;
    if (bounty) rw += `<div class="rw-block"><span class="rw-title bounty">Bounty +${bounty} caps${G.rival === markedRival() ? ' — marked rival' : ''}</span></div>`;
  }
  if (cardKeys.length) rw += `<div class="rw-block"><span class="rw-title">New cards</span><div class="rw-chips">${rewardChipsHTML(cardKeys)}</div></div>`;
  for (const c of completed) rw += `<div class="rw-block"><span class="rw-title">Challenge complete — ${c.name}</span><div class="rw-chips">${rewardChipsHTML(c.keys)}</div></div>`;
  for (const u of ups) rw += `<div class="rw-block"><span class="rw-title lvlup">Level ${u.level} reached! +50 caps</span><div class="rw-chips">${rewardChipsHTML(u.keys)}</div></div>`;
  $('result-rewards').innerHTML = rw;
  Sound.sfx(won ? 'win' : 'lose');
  if (won && (cardKeys.length || completed.length)) Sound.sfx('coin');
  haptic(won ? [30, 40, 30] : 60);
  $('result-title').textContent = won ? 'You Win' : 'You Lose';
  $('result-detail').textContent = detail || (won
    ? `You outbid ${G.oppName} and take the pot.`
    : `${G.oppName} takes the pot.`);
  const rc = $('result-caps');
  rc.textContent = (won ? '+' + (G.bet + bounty) : '−' + G.bet) + ' ◉  →  ' + save.caps + ' caps';
  rc.className = 'result-caps ' + (won ? 'win' : 'lose');
  setTimeout(() => $('overlay-result').classList.add('active'), 600);
}

/* ---------------- Rendering ---------------- */
function setMessage(html) { $('message-bar').innerHTML = html; }

function renderAll() {
  renderTracks();
  renderHand();
  renderCounts();
  renderTurn();
}
function renderCounts() {
  $('deck-count').textContent = G.deck.p.length;
  $('opp-hand-count').textContent = `Hand ${G.hand.a.length} · Deck ${G.deck.a.length}`;
}
function renderTurn() {
  const el = $('turn-indicator');
  if (G.over) { el.textContent = 'Match over'; el.className = 'turn-indicator'; return; }
  if (G.turn === 'p') { el.textContent = 'Your turn'; el.className = 'turn-indicator me'; }
  else { el.textContent = G.oppName + '…'; el.className = 'turn-indicator ai'; }
}

function renderTracks() {
  const wrap = $('tracks');
  wrap.innerHTML = '';
  const sel = G.selected !== null ? G.hand.p[G.selected] : null;
  const targets = sel && G.turn === 'p' && !G.over ? legalTargets('p', sel) : [];

  for (let i = 0; i < 3; i++) {
    const track = document.createElement('div');
    track.className = 'track';
    const lw = laneWinner(i);
    if (lw === 'p') track.classList.add('lane-won-p');
    if (lw === 'a') track.classList.add('lane-won-a');

    track.appendChild(renderCaravan('a', i, targets, sel));
    const div = document.createElement('div');
    div.className = 'track-divider';
    track.appendChild(div);
    track.appendChild(renderCaravan('p', i, targets, sel));
    wrap.appendChild(track);
  }
}

function renderCaravan(side, i, targets, sel) {
  const cv = G.cvs[side][i];
  const el = document.createElement('div');
  el.className = 'caravan ' + (side === 'p' ? 'mine' : 'opp');

  const header = document.createElement('div');
  header.className = 'cv-header';
  const v = cvValue(cv);
  const badge = document.createElement('span');
  badge.className = 'cv-value' + (isSold(v) ? ' sold' : v > 26 ? ' over' : '');
  badge.textContent = v;
  const dir = document.createElement('span');
  dir.className = 'cv-dir';
  dir.textContent = cv.dir === 1 ? '▲' : cv.dir === -1 ? '▼' : '—';
  const suit = document.createElement('span');
  const s = cvSuit(cv);
  suit.className = 'cv-suit' + (s && RED[s] ? ' red' : '');
  suit.textContent = s || '';
  header.appendChild(badge); header.appendChild(dir); header.appendChild(suit);
  if (side === 'p' && cv.cards.length && G.turn === 'p' && !G.over) {
    // two-tap disband, no browser dialog: tap to arm, tap again to confirm
    const db = document.createElement('button');
    db.className = 'cv-disband';
    db.textContent = 'Disband';
    db.onclick = e => {
      e.stopPropagation();
      if (G.busy) return;
      if (!db.classList.contains('armed')) {
        db.classList.add('armed');
        db.textContent = 'Sure?';
        setTimeout(() => { if (db.isConnected) { db.classList.remove('armed'); db.textContent = 'Disband'; } }, 2500);
        return;
      }
      disband('p', i);
      if (G.mode === 'online') Net.send({ t: 'move', kind: 'disband', i });
      Sound.sfx('remove');
      afterPlayerAction(`You disband caravan ${i + 1}.`);
    };
    header.appendChild(db);
  }
  el.appendChild(header);

  const cardsEl = document.createElement('div');
  cardsEl.className = 'cv-cards';

  cv.cards.forEach((sl, sIdx) => {
    const slot = document.createElement('div');
    slot.className = 'slot';
    const mc = document.createElement('div');
    mc.className = 'mini-card' + (RED[sl.card.suit] ? ' red' : '');
    mc.innerHTML = `<span class="mc-rank">${rankLabel(sl.card.rank)}</span><span class="mc-pip">${sl.card.suit}</span>`;
    const isTarget = targets.some(t => t.kind === 'slot' && t.side === side && t.i === i && t.s === sIdx);
    if (isTarget) {
      mc.classList.add('targetable');
      mc.onclick = () => playerPlaySelected({ kind: 'slot', side, i, s: sIdx });
    }
    slot.appendChild(mc);

    if (sl.kings || sl.queens.length || sl.joker) {
      const at = document.createElement('div');
      at.className = 'attachments';
      for (let k = 0; k < sl.kings; k++) at.innerHTML += `<span class="att-chip K">K</span>`;
      for (const qs of sl.queens) at.innerHTML += `<span class="att-chip${RED[qs] ? ' red' : ''}">Q${qs}</span>`;
      if (sl.joker) at.innerHTML += `<span class="att-chip JO">★</span>`;
      slot.appendChild(at);
    }
    cardsEl.appendChild(slot);
  });

  el.appendChild(cardsEl);

  // number-card target: the whole caravan area lights up and is tappable
  const isCvTarget = targets.some(t => t.kind === 'caravan' && t.side === side && t.i === i);
  if (isCvTarget) {
    el.classList.add('targetable');
    el.onclick = () => playerPlaySelected({ kind: 'caravan', side, i });
  }
  return el;
}

function renderHand() {
  const wrap = $('hand');
  wrap.innerHTML = '';
  G.hand.p.forEach((c, idx) => {
    const el = document.createElement('div');
    const red = RED[c.suit];
    el.className = 'hand-card' + (red ? ' red' : '') + (c.rank === 14 ? ' joker' : '');
    if (idx === G.selected) el.classList.add('selected');
    const canUse = G.turn === 'p' && !G.over && legalTargets('p', c).length > 0;
    if (!canUse && !(G.turn === 'p' && !G.over)) el.classList.add('disabled');
    else if (!canUse && !G.discardArmed) el.classList.add('disabled');
    const r = rankLabel(c.rank);
    if (c.rank === 14) {
      el.innerHTML = `<span class="hc-corner">★</span><span class="hc-pip">★</span>` +
        `<span class="hc-joker-label">JOKER</span><span class="hc-corner flip">★</span>`;
    } else {
      const corners = `<span class="hc-corner">${r}<i>${c.suit}</i></span>` +
        `<span class="hc-corner flip">${r}<i>${c.suit}</i></span>`;
      const center = c.rank >= 11
        ? `<span class="hc-face">${r}<small>${c.suit}</small></span>`
        : `<span class="hc-pip">${c.suit}</span>`;
      el.innerHTML = corners + center;
    }
    el.onclick = () => {
      if (G.turn !== 'p' || G.over || G.busy) return;
      if (G.discardArmed) {
        const card = discard('p', idx);
        if (G.mode === 'online') Net.send({ t: 'move', kind: 'discard', handIdx: idx });
        G.discardArmed = false;
        $('btn-discard').classList.remove('armed');
        afterPlayerAction(`You discard ${c.rank === 14 ? 'a Joker' : rankLabel(card.rank) + card.suit}.`);
        return;
      }
      G.selected = (G.selected === idx) ? null : idx;
      if (G.selected !== null) Sound.sfx('select');
      renderTracks(); renderHand();
      if (G.selected !== null) {
        const n = legalTargets('p', c).length;
        setMessage(cardDesc(c) + (n ? ' Tap a highlighted target.' : ' <b>No legal target</b> — try another card or discard.'));
      } else setMessage('');
    };
    wrap.appendChild(el);
  });
  $('btn-discard').disabled = !(G.turn === 'p' && !G.over);
}

$('btn-discard').onclick = () => {
  if (G.turn !== 'p' || G.over || G.busy) return;
  G.discardArmed = !G.discardArmed;
  G.selected = null;
  $('btn-discard').classList.toggle('armed', G.discardArmed);
  setMessage(G.discardArmed ? 'Tap a card in your hand to <b>discard</b> it.' : '');
  renderTracks(); renderHand();
};

/* ---------------- Turn engine ---------------- */
function playerPlaySelected(target) {
  if (G.busy || G.selected === null) return;
  const selIdx = G.selected;
  const c = applyMove('p', selIdx, target);
  if (G.mode === 'online') Net.send({ t: 'move', kind: 'play', handIdx: selIdx, target });
  if (G.mode === 'ai' && c.rank === 11) save.progress.jacks++; // challenge tracking
  Sound.sfx(c.rank === 11 || c.rank === 14 ? 'remove' : 'play');
  haptic(15);
  G.selected = null;
  const label = c.rank === 14 ? 'Joker' : rankLabel(c.rank) + (c.suit === '★' ? '' : c.suit);
  afterPlayerAction(`You play <b>${label}</b>.`);
}

function afterPlayerAction(msg) {
  if (G.mode === 'ai' && G.cvs.p.some(cv => cvValue(cv) === 26)) save.progress.sold26 = true; // challenge tracking
  setMessage(msg);
  addLog(msg);
  renderAll();
  const w = checkGameEnd();
  if (w) {
    if (G.mode === 'online') { endOnlineMatch(w); return; }
    endMatch(w); renderAll(); return;
  }
  G.turn = 'a';
  if (G.mode === 'online') { renderTurn(); return; } // wait for the remote move
  G.busy = true;
  renderTurn();
  setTimeout(aiTurnStep, 850);
}

function aiTurnStep() {
  const desc = aiTakeTurn();
  Sound.sfx('play');
  renderAll();
  if (desc) { setMessage(desc); addLog(desc); }
  const w = checkGameEnd();
  if (w) { endMatch(w); renderAll(); return; }
  G.turn = 'p';
  G.busy = false;
  renderAll();
  if (G.setupLeft.p > 0) {
    setMessage(`Setup: place a number card on an empty caravan (${G.setupLeft.p} left).`);
  }
}

/* ---------------- The Mojave Circuit (living leaderboard) ----------------
   Twelve rivals play each other on a fixed schedule: every 3h "tick" a few
   seeded matches shift their Elo-style ratings. The sim is a pure function of
   the clock (seeded RNG per tick), so the ladder moves while the app is closed
   and computes identically on every device — no server needed. The player sits
   on the same ladder via save.rating, updated after every AI match. */
const CIRCUIT_EPOCH = Date.UTC(2026, 0, 1);
const TICK_MS = 3 * 60 * 60 * 1000;
const RIVALS = [
  { name: 'Mr. House', base: 1430 },
  { name: 'Vulpes',    base: 1350 },
  { name: 'Benny',     base: 1290 },
  { name: 'Swank',     base: 1230 },
  { name: 'Veronica',  base: 1180 },
  { name: 'Boone',     base: 1140 },
  { name: 'Cass',      base: 1100 },
  { name: 'Arcade',    base: 1060 },
  { name: 'Ringo',     base: 1010 },
  { name: 'Raul',      base: 960 },
  { name: 'Easy Pete', base: 900 },
  { name: 'No-bark',   base: 830 },
];
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
function circuitTick() { return Math.max(1, Math.floor((Date.now() - CIRCUIT_EPOCH) / TICK_MS)); }
let _circuit = null; // memoized per tick
function circuit() {
  const tick = circuitTick();
  if (_circuit && _circuit.tick === tick) return _circuit;
  const n = RIVALS.length;
  const r = RIVALS.map(x => x.base);
  const wins = RIVALS.map(x => Math.round(x.base / 9)); // lifetime wins seed
  let prev = r.slice();
  const events = [];
  for (let t = 1; t <= tick; t++) {
    const rng = mulberry32((t * 0x9E3779B9) >>> 0);
    const games = 2 + Math.floor(rng() * 2);
    for (let g = 0; g < games; g++) {
      const i = Math.floor(rng() * n);
      let j = Math.floor(rng() * (n - 1)); if (j >= i) j++;
      const pi = 1 / (1 + Math.pow(10, (r[j] - r[i]) / 400));
      const iWon = rng() < pi;
      const d = Math.max(1, Math.round(28 * (iWon ? 1 - pi : pi)));
      r[i] += iWon ? d : -d; r[j] += iWon ? -d : d;
      wins[iWon ? i : j]++;
      if (t > tick - 16) events.push({ at: CIRCUIT_EPOCH + t * TICK_MS, w: iWon ? i : j, l: iWon ? j : i, d });
    }
    for (let k = 0; k < n; k++) r[k] += (RIVALS[k].base - r[k]) * 0.02; // upsets fade over days
    if (t === tick - 8) prev = r.slice(); // snapshot ~24h back, for movement arrows
  }
  _circuit = { tick, r: r.map(Math.round), prev: prev.map(Math.round), wins, events: events.reverse() };
  return _circuit;
}
function markedRival() { // rival of the day — beating them pays double bounty
  return Math.floor(mulberry32((Math.floor(Date.now() / 86400000) ^ 0x5F356495) >>> 0)() * RIVALS.length);
}
function ladder(ratings) {
  const c = circuit();
  const rows = RIVALS.map((x, i) => ({ i, name: x.name, rating: (ratings || c.r)[i], wins: c.wins[i] }));
  rows.push({ me: true, name: save.name || 'Courier', rating: save.rating, wins: save.wins });
  rows.sort((a, b) => b.rating - a.rating);
  return rows;
}
function myRank(ratings) { return ladder(ratings).findIndex(x => x.me) + 1; }
function rankTitle(rating) {
  return rating >= 1350 ? 'Mojave Legend' : rating >= 1250 ? 'Caravan Master' :
         rating >= 1150 ? 'High Roller' : rating >= 1050 ? 'Gambler' :
         rating >= 950 ? 'Courier' : 'Drifter';
}
function rivalEps(idx) { // circuit rating → AI blunder rate
  return Math.max(0.02, Math.min(0.5, (1470 - circuit().r[idx]) / 1400));
}
function bountyFor(idx, bet) { // extra caps for beating someone rated above you
  const diff = circuit().r[idx] - save.rating;
  let b = diff > 0 ? Math.round(bet * Math.min(1.5, diff / 150)) : 0;
  if (idx === markedRival()) b = Math.max(b * 2, Math.round(bet * 0.5));
  return b;
}
function pickRival(exclude) { // default opponent: someone near your rating
  const near = RIVALS.map((x, i) => ({ i, d: Math.abs(circuit().r[i] - save.rating) }))
    .filter(x => x.i !== exclude)
    .sort((a, b) => a.d - b.d).slice(0, 4);
  return near[Math.floor(Math.random() * near.length)].i;
}
function agoLabel(at) {
  const m = Math.max(1, Math.round((Date.now() - at) / 60000));
  return m < 60 ? m + 'm ago' : m < 2880 ? Math.round(m / 60) + 'h ago' : Math.round(m / 1440) + 'd ago';
}
function renderLeaderboard() {
  const c = circuit();
  const rows = ladder();
  const prevRows = ladder(c.prev);
  const rank = rows.findIndex(x => x.me) + 1;
  $('lb-title-chip').textContent = rankTitle(save.rating) + ' · ' + (save.name || 'Courier');
  $('lb-stats').innerHTML = `
    <div class="lb-stat"><b>#${rank}</b><span>rank</span></div>
    <div class="lb-stat"><b>${save.rating}</b><span>rating</span></div>
    <div class="lb-stat"><b>${save.wins}</b><span>wins</span></div>
    <div class="lb-stat"><b>${save.bestStreak}</b><span>best streak</span></div>`;
  const away = $('lb-away');
  if (save.lbSeen && save.lbSeen.rank !== rank && Date.now() - save.lbSeen.at > 3600000) {
    const up = rank < save.lbSeen.rank;
    away.innerHTML = `While you were away you ${up ? 'climbed' : 'slipped'}: <b>#${save.lbSeen.rank} → #${rank}</b>${up ? '' : ' — call someone out and win it back'}`;
    away.className = 'lb-away ' + (up ? 'up' : 'down');
  } else away.className = 'lb-away hidden';
  save.lbSeen = { rank, at: Date.now() };
  persist();
  const marked = markedRival();
  $('lb-table').innerHTML = rows.map((x, idx) => {
    const was = prevRows.findIndex(p => p.me === x.me && (x.me || p.i === x.i));
    const mv = was - idx;
    const arrow = mv > 0 ? `<i class="mv up">▲${mv}</i>` : mv < 0 ? `<i class="mv down">▼${-mv}</i>` : '<i class="mv"></i>';
    const chip = !x.me && x.i === marked ? '<span class="marked-chip">2× bounty</span>' : '';
    return `
    <div class="lb-row${x.me ? ' me' : ''}"${x.me ? '' : ` data-rival="${x.i}"`}>
      <span class="lb-rank">${idx + 1}</span>${arrow}
      <span class="lb-name">${x.name}${x.me ? ' — you' : ''}${chip}</span>
      <span class="lb-sub">${x.wins} wins</span>
      <span class="lb-caps">${x.rating}</span>
    </div>`;
  }).join('');
  $('lb-table').onclick = e => {
    const row = e.target.closest('[data-rival]');
    if (row) openBetScreen(parseInt(row.dataset.rival, 10));
  };
  // live feed: simulated circuit results merged with your own recent matches
  const feed = c.events.map(ev => ({ at: ev.at, txt: `<b>${RIVALS[ev.w].name}</b> beat ${RIVALS[ev.l].name} <i>+${ev.d}</i>` }))
    .concat((save.circuitLog || []).map(x => ({ at: x.at, txt: x.txt, me: true })))
    .sort((a, b) => b.at - a.at).slice(0, 10);
  $('lb-feed').innerHTML = feed.map(f => `
    <div class="feed-row${f.me ? ' me' : ''}"><span class="feed-txt">${f.txt}</span><span class="feed-when">${agoLabel(f.at)}</span></div>`).join('');
}

/* ---------------- Deck builder ---------------- */
let deckEditIdx = 0;
function renderDecks() {
  deckEditIdx = Math.max(0, Math.min(2, deckEditIdx));
  const tabs = $('deck-tabs');
  tabs.innerHTML = '';
  save.decks.forEach((d, i) => {
    const b = document.createElement('button');
    b.className = 'deck-tab' + (i === deckEditIdx ? ' on' : '');
    b.innerHTML = `${d.name}<small>${deckSize(d)} cards</small>`;
    b.onclick = () => { deckEditIdx = i; renderDecks(); };
    tabs.appendChild(b);
  });
  const deck = save.decks[deckEditIdx];
  const size = deckSize(deck);
  $('deck-count-label').innerHTML = size >= MIN_DECK
    ? `<b class="ok">${size} cards</b> — ready to play`
    : `<b class="bad">${size} cards</b> — needs at least ${MIN_DECK}`;

  const grid = $('coll-grid');
  grid.innerHTML = '';
  for (const k of ALL_KEYS) {
    const owned = save.collection[k] || 0;
    const inDeck = deck.cards[k] || 0;
    const r = keyRank(k), s = keySuit(k);
    const cell = document.createElement('div');
    cell.className = 'coll-cell' + (owned === 0 ? ' locked' : '');
    const colorCls = r === 14 ? ' purple' : (RED[s] ? ' red' : '');
    cell.innerHTML = `
      <span class="cc-face${colorCls}">${keyLabel(k)}</span>
      <span class="cc-counts">${inDeck}<i>/${owned}</i></span>
      <span class="cc-btns">
        <button ${inDeck === 0 ? 'disabled' : ''} data-k="${k}" data-d="-1">−</button>
        <button ${inDeck >= owned ? 'disabled' : ''} data-k="${k}" data-d="1">+</button>
      </span>`;
    grid.appendChild(cell);
  }
  grid.onclick = e => {
    const btn = e.target.closest('button[data-k]');
    if (!btn || btn.disabled) return;
    const k = btn.dataset.k, d = parseInt(btn.dataset.d, 10);
    const deck2 = save.decks[deckEditIdx];
    const next = (deck2.cards[k] || 0) + d;
    if (next < 0 || next > (save.collection[k] || 0)) return;
    if (next === 0) delete deck2.cards[k]; else deck2.cards[k] = next;
    persist(); renderDecks();
  };
}
let decksReturn = 'screen-menu';
$('btn-decks').onclick = () => { decksReturn = 'screen-menu'; deckEditIdx = save.activeDeck; renderDecks(); show('screen-decks'); };
$('btn-bet-editdecks').onclick = () => { decksReturn = 'screen-bet'; deckEditIdx = save.activeDeck; renderDecks(); show('screen-decks'); };
$('btn-decks-back').onclick = () => {
  if (decksReturn === 'screen-bet') { renderDeckSelect(); $('bet-caps').textContent = save.caps; show('screen-bet'); }
  else { refreshMenu(); show('screen-menu'); }
};
$('btn-deck-fill').onclick = () => {
  const deck = save.decks[deckEditIdx];
  deck.cards = {};
  for (const k of ALL_KEYS) if (save.collection[k]) deck.cards[k] = save.collection[k];
  persist(); renderDecks();
};
$('btn-deck-clear').onclick = () => {
  save.decks[deckEditIdx].cards = {};
  persist(); renderDecks();
};

/* ---------------- Challenges screen ---------------- */
function renderChallenges() {
  $('challenge-list').innerHTML = CHALLENGES.map(c => {
    const done = !!save.claimed[c.id];
    const cur = Math.min(c.get(save), c.target);
    const pct = Math.round(cur / c.target * 100);
    const rewardHTML = Array.isArray(c.reward) ? rewardChipsHTML(c.reward) : `<span class="rw-chip">${c.reward.random} random</span>`;
    return `
      <div class="challenge-row${done ? ' done' : ''}">
        <div class="ch-main">
          <span class="ch-name">${c.name}${done ? ' ✓' : ''}</span>
          <span class="ch-desc">${c.desc}</span>
          <span class="ch-bar"><i style="width:${done ? 100 : pct}%"></i></span>
        </div>
        <div class="ch-side">
          <span class="ch-progress">${done ? 'claimed' : cur + ' / ' + c.target}</span>
          <div class="rw-chips">${rewardHTML}</div>
        </div>
      </div>`;
  }).join('');
}
$('btn-challenges').onclick = () => { renderChallenges(); show('screen-challenges'); };
$('btn-challenges-back').onclick = () => { refreshMenu(); show('screen-menu'); };

/* ---------------- Settings ---------------- */
function applyTheme() {
  document.body.dataset.theme = save.theme;
  const t = THEMES.find(x => x.id === save.theme) || THEMES[0];
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t.bg;
}
function renderSettings() {
  const grid = $('theme-grid');
  grid.innerHTML = '';
  for (const t of THEMES) {
    const chip = document.createElement('button');
    chip.className = 'theme-chip' + (t.id === save.theme ? ' on' : '');
    chip.innerHTML = `<span class="theme-dot" style="background:${t.bg};--dot-accent:${t.accent}"></span>${t.name}`;
    chip.onclick = () => { save.theme = t.id; persist(); applyTheme(); renderSettings(); };
    grid.appendChild(chip);
  }
  document.querySelectorAll('#seg-anim .seg-btn').forEach(b =>
    b.classList.toggle('on', (b.dataset.anim === 'on') === save.anim));
  bindSeg('seg-sound', save.sound ? 'on' : 'off');
  bindSeg('seg-music', save.music ? 'on' : 'off');
  bindSeg('seg-haptics', save.haptics ? 'on' : 'off');
  bindSeg('seg-diff', save.difficulty);
  $('input-name').value = save.name;
}
function bindSeg(id, current) {
  document.querySelectorAll('#' + id + ' .seg-btn').forEach(b =>
    b.classList.toggle('on', b.dataset.v === current));
}
document.querySelectorAll('#seg-sound .seg-btn').forEach(b => b.onclick = () => {
  save.sound = b.dataset.v === 'on'; persist(); renderSettings();
  if (save.sound) Sound.sfx('select');
});
document.querySelectorAll('#seg-music .seg-btn').forEach(b => b.onclick = () => {
  save.music = b.dataset.v === 'on'; persist(); renderSettings();
  if (save.music) Sound.startMusic(); else Sound.stopMusic();
});
document.querySelectorAll('#seg-haptics .seg-btn').forEach(b => b.onclick = () => {
  save.haptics = b.dataset.v === 'on'; persist(); renderSettings();
  haptic(20);
});
document.querySelectorAll('#seg-diff .seg-btn').forEach(b => b.onclick = () => {
  save.difficulty = b.dataset.v; persist(); renderSettings();
});
document.querySelectorAll('#seg-anim .seg-btn').forEach(b => b.onclick = () => {
  save.anim = b.dataset.anim === 'on'; persist(); renderSettings();
});
$('input-name').onchange = e => {
  const v = validateName(e.target.value);
  if (v.ok) { save.name = v.name; save.nameChosen = true; persist(); }
  else e.target.value = save.name; // reject invalid or taken names
};
$('btn-reset').onclick = () => {
  if (confirm('Reset all progress? Caps, wins, and streaks go back to the start.')) {
    save = migrateCollection(Object.assign({}, DEFAULT_SAVE, { theme: save.theme, name: save.name, nameChosen: save.nameChosen }));
    persist(); renderSettings(); refreshMenu();
  }
};

/* ---------------- Rules slides ---------------- */
let slideIdx = 0;
const slideCount = document.querySelectorAll('.slide').length;
function goSlide(i) {
  slideIdx = Math.max(0, Math.min(slideCount - 1, i));
  $('slides').style.transform = `translateX(-${slideIdx * 100}%)`;
  $('slide-prev').disabled = slideIdx === 0;
  $('slide-next').disabled = slideIdx === slideCount - 1;
  [...$('slide-dots').children].forEach((d, k) => d.classList.toggle('on', k === slideIdx));
}
for (let i = 0; i < slideCount; i++) {
  const dot = document.createElement('span');
  dot.className = 'slide-dot';
  dot.onclick = () => goSlide(i);
  $('slide-dots').appendChild(dot);
}
$('slide-prev').onclick = () => goSlide(slideIdx - 1);
$('slide-next').onclick = () => goSlide(slideIdx + 1);
(() => { // swipe
  const vp = document.querySelector('.slides-viewport');
  let x0 = null;
  vp.addEventListener('touchstart', e => { x0 = e.touches[0].clientX; }, { passive: true });
  vp.addEventListener('touchend', e => {
    if (x0 === null) return;
    const dx = e.changedTouches[0].clientX - x0;
    if (Math.abs(dx) > 40) goSlide(slideIdx + (dx < 0 ? 1 : -1));
    x0 = null;
  }, { passive: true });
})();
goSlide(0);

/* ---------------- Unique name ---------------- */
const TAKEN_NAMES = ['mr. house', 'benny', 'cass', 'ringo', 'raul', 'no-bark', 'veronica', 'courier six'];
function validateName(n) {
  n = n.trim();
  if (n.length < 2) return { ok: false, err: 'At least 2 characters.' };
  if (TAKEN_NAMES.includes(n.toLowerCase())) return { ok: false, err: 'That name is taken — pick your own.' };
  return { ok: true, name: n };
}
function confirmWelcomeName() {
  const v = validateName($('welcome-name').value);
  if (!v.ok) { $('name-error').textContent = v.err; return; }
  save.name = v.name; save.nameChosen = true; persist();
  $('overlay-name').classList.remove('active');
  refreshMenu();
}
$('btn-name-ok').onclick = confirmWelcomeName;
$('welcome-name').addEventListener('keydown', e => { if (e.key === 'Enter') confirmWelcomeName(); });
$('welcome-name').addEventListener('input', () => { $('name-error').textContent = ''; });

/* ---------------- Account sign-in ----------------
   These providers need app credentials registered with Google/Apple before they
   can issue logins for your domain. Put the IDs here once you have them:
   - Google: create an OAuth "Web application" client at console.cloud.google.com
   - Apple: create a Services ID with Sign in with Apple at developer.apple.com
   Game Center has no web API — it activates in the Capacitor iOS build. */
const AUTH = {
  googleClientId: '',   // e.g. '1234-abc.apps.googleusercontent.com'
  appleServiceId: '',   // e.g. 'com.fahad.caravan.web'
};
function setAccountNote(msg) { $('account-note').textContent = msg; }
function signedIn(provider, displayName) {
  if (displayName) {
    const v = validateName(displayName.slice(0, 14));
    if (v.ok) { save.name = v.name; save.nameChosen = true; }
  }
  save.account = provider;
  persist(); renderSettings(); refreshMenu();
  setAccountNote('Signed in with ' + provider + ' as ' + save.name + '.');
}
$('btn-login-google').onclick = () => {
  if (!AUTH.googleClientId) {
    setAccountNote('Google Sign-In needs a (free) OAuth client ID from console.cloud.google.com — add it to AUTH.googleClientId in game.js and it activates.');
    return;
  }
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client';
  s.onload = () => {
    google.accounts.id.initialize({
      client_id: AUTH.googleClientId,
      callback: resp => {
        try {
          const payload = JSON.parse(atob(resp.credential.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
          signedIn('Google', payload.given_name || payload.name);
        } catch (e) { setAccountNote('Google sign-in failed.'); }
      },
    });
    google.accounts.id.prompt();
  };
  s.onerror = () => setAccountNote('Could not reach Google — check your connection.');
  document.head.appendChild(s);
};
$('btn-login-apple').onclick = () => {
  if (!AUTH.appleServiceId) {
    setAccountNote('Sign in with Apple needs an Apple Developer Services ID (developer.apple.com) and an HTTPS domain — add it to AUTH.appleServiceId in game.js and it activates.');
    return;
  }
  const s = document.createElement('script');
  s.src = 'https://appleid.cdn-apple.com/appleauth/static/jsapi/appleid/1/en_US/appleid.auth.js';
  s.onload = async () => {
    try {
      AppleID.auth.init({ clientId: AUTH.appleServiceId, scope: 'name', redirectURI: location.origin + location.pathname, usePopup: true });
      const res = await AppleID.auth.signIn();
      const n = res.user && res.user.name ? res.user.name.firstName : null;
      signedIn('Apple', n);
    } catch (e) { setAccountNote('Apple sign-in was cancelled or failed.'); }
  };
  s.onerror = () => setAccountNote('Could not reach Apple — check your connection.');
  document.head.appendChild(s);
};
$('btn-login-gc').onclick = () => {
  setAccountNote('Game Center has no web version — it activates automatically in the native iOS build (Capacitor + @capgo/capacitor-game-center plugin). See README.');
};

/* ---------------- Install & offline (PWA) ---------------- */
let deferredInstall = null;
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferredInstall = e; });
$('btn-install').onclick = async () => {
  if (deferredInstall) { // Android / desktop Chrome
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    return;
  }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  alert(ios
    ? 'On iPhone: open this page in Safari, tap the Share button, then "Add to Home Screen". The game runs fullscreen like a native app and works offline.'
    : 'Open this page in Chrome and use "Add to Home screen" from the browser menu, or install from the address-bar icon.');
};
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* ---------------- Boot ---------------- */
applyTheme();
refreshMenu();
show('screen-menu');
if (!save.nameChosen) {
  $('welcome-name').value = save.name === 'Courier' ? '' : save.name;
  $('overlay-name').classList.add('active');
}
