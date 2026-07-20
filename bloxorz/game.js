'use strict';
/* Bloxorz-style block-rolling puzzle — plain JS, no build step.
   Engine is DOM-free (also loadable under node for the level solver);
   everything below boot() is UI/renderer. */

/* ================================ LEVELS ================================
   Map legend (strings are rows; x = column, y = row):
     .  void            #  floor tile        S  start tile
     G  goal hole       o  fragile tile (breaks under a standing block)
     a-d soft switch (any contact)   A-D hard switch (standing block only)
     1-4 bridge tile (group per digit, open/closed)
     T  teleporter (splits a standing block into two half-cubes)
   Per level:
     switches: { letter: { bridges:['1'], action:'toggle'|'open'|'close' } }
     bridgesOpen: { '1': true }   (default closed)
     tele: [[x,y],[x,y]]          (where the two half-cubes appear)
*/
const LEVELS = [
  { // 1 — plain rolling
    code: '110501',
    map: [
      '####......',
      '#S##......',
      '#########.',
      '.########.',
      '...###G##.',
      '...######.',
    ],
  },
  { // 2 — a longer route
    code: '780464',
    map: [
      '..........',
      '.######...',
      '.#....###.',
      '.#S##..##.',
      '.####...#.',
      '...##...#.',
      '..####..#.',
      '..#G#####.',
      '..###.....',
    ],
  },
  { // 3 — first fragile tiles
    code: '290299',
    map: [
      '.#####....',
      '.#S###....',
      '.####oo...',
      '....#oo#..',
      '....##oo#.',
      '.....#oG#.',
      '.....####.',
    ],
  },
  { // 4 — soft switch opens a bridge
    code: '918660',
    map: [
      '######..######',
      '#S####..######',
      '##a###11###G##',
      '######..######',
    ],
    switches: { a: { bridges: ['1'], action: 'toggle' } },
  },
  { // 5 — hard switch: only a standing block is heavy enough
    code: '520967',
    map: [
      '######.....',
      '#S####.....',
      '###A##.####',
      '######11#G#',
      '######.####',
    ],
    switches: { A: { bridges: ['1'], action: 'open' } },
  },
  { // 6 — fragile field
    code: '028431',
    map: [
      '...oooo...',
      '.#oooooo..',
      '.#S#oooo#.',
      '.####oo#G#',
      '......####',
    ],
  },
  { // 7 — the teleporter splits you in two
    code: '524383',
    map: [
      '#####..#####',
      '#S###..#####',
      '##T##..##G##',
      '#####..#####',
    ],
    tele: [[8, 1], [10, 3]],
  },
  { // 8 — two switches, two bridges
    code: '189493',
    map: [
      '...............',
      '.#S###..###....',
      '.##a##11###.###',
      '.#####..###2###',
      '.#####..###.#G#',
      '........###.###',
      '........#b#....',
      '........###....',
    ],
    switches: {
      a: { bridges: ['1'], action: 'toggle' },
      b: { bridges: ['2'], action: 'toggle' },
    },
  },
  { // 9 — narrow catwalks
    code: '499707',
    map: [
      '..####.....',
      '..#S##.....',
      '..####.....',
      '...##......',
      '...##......',
      '...##......',
      '.#####.....',
      '.####......',
      '.##........',
      '.##........',
      '.#####.....',
      '.###G#.....',
      '.#####.....',
    ],
  },
  { // 10 — a one-way commitment
    code: '074355',
    map: [
      '######......####',
      '######..##..####',
      '#S####11#a22##G#',
      '######..##..####',
      '######......####',
    ],
    switches: { a: { bridges: ['1', '2'], action: 'toggle' } },
    bridgesOpen: { '1': true },
  },
  { // 11 — fragile bridge crossing
    code: '300590',
    map: [
      '.####.....',
      '.#S.#..##.',
      '.##.#.###.',
      '..#oo.o#..',
      '..#oooo#..',
      '..##o###..',
      '...#o#....',
      '...#G#....',
      '...###....',
    ],
  },
  { // 12 — split, then thread both halves home
    code: '291709',
    map: [
      '#####..#####',
      '#S###..##.##',
      '##T##..##G##',
      '#####..##.##',
      '.......#####',
    ],
    tele: [[7, 0], [11, 4]],
  },
  { // 13 — heavy and light
    code: '958640',
    map: [
      '...................',
      '.#####..#####..###.',
      '.#S###..#####..###.',
      '.##A#########..###.',
      '.#####..##a##22#G#.',
      '.#####..#####..###.',
      '........#####......',
    ],
    switches: {
      A: { bridges: ['2'], action: 'toggle' },
      a: { bridges: ['2'], action: 'toggle' },
    },
  },
  { // 14 — the orange gauntlet
    code: '448106',
    map: [
      '...######...',
      '...#S####...',
      '...######...',
      '....#oo#....',
      '....#oo#....',
      '..###oo###..',
      '..#oooooo#..',
      '..#oo..oo#..',
      '..#oo..oo#..',
      '..#oooooo#..',
      '..####G###..',
      '..########..',
    ],
  },
  { // 15 — everything at once
    code: '210362',
    map: [
      '######.######..###',
      '#S####.##a###..###',
      '##T###.######12#G#',
      '######.######..###',
      '.......###b##.....',
      '.......######.....',
    ],
    tele: [[8, 1], [12, 5]],
    switches: {
      a: { bridges: ['1'], action: 'open' },
      b: { bridges: ['2'], action: 'open' },
    },
  },
  { // 16 — a fragile moat around the goal
    code: '644208',
    map: [
      '######..##oo##',
      '#S####..#oo#G#',
      '##a###11#oo###',
      '######..##oo##',
      '######..######',
    ],
    switches: { a: { bridges: ['1'], action: 'toggle' } },
  },
  { // 17 — split, press both, drop through
    code: '767053',
    map: [
      '######..##########',
      '#S####..##########',
      '##T###..#a######b#',
      '............1.....',
      '............2.....',
      '..........#####...',
      '..........##G##...',
      '..........#####...',
    ],
    tele: [[8, 0], [17, 2]],
    switches: {
      a: { bridges: ['1'], action: 'open' },
      b: { bridges: ['2'], action: 'open' },
    },
  },
  { // 18 — the orange stair
    code: '287029',
    map: [
      '..####........',
      '..#S##........',
      '..####........',
      '...oo.........',
      '...oo.........',
      '..#####.......',
      '..##o##.......',
      '...#o#oo......',
      '...#o#oo......',
      '...####oo##...',
      '......#oo##...',
      '......##G##...',
      '......#####...',
    ],
  },
  { // 19 — bridge relay
    code: '405643',
    map: [
      '######..####..###..###',
      '#S####..####..###..###',
      '######11#b##22#A#33#G#',
      '######..####..###..###',
      '######..####..###..###',
    ],
    switches: {
      b: { bridges: ['1', '2'], action: 'toggle' },
      A: { bridges: ['3'], action: 'open' },
    },
    bridgesOpen: { '1': true },
  },
  { // 20 — the whole toolbox
    code: '860572',
    map: [
      '#####...###.####',
      '#S###...#a#1####',
      '##T##...###.#A##',
      '#####.......####',
      '............####',
      '..............2.',
      '..............2.',
      '..........######',
      '..........#ooG##',
      '..........######',
    ],
    tele: [[8, 0], [15, 4]],
    switches: {
      a: { bridges: ['1'], action: 'open' },
      A: { bridges: ['2'], action: 'open' },
    },
  },
];

// Optimal move count per level (verified by the BFS solver in dev).
const PARS = [6, 11, 8, 10, 11, 18, 12, 19, 12, 11, 10, 14, 14, 11, 18, 13, 21, 14, 20, 31];

/* ================================ ENGINE ================================ */

const DIRS = {
  up:    { x: 0, y: -1 },
  down:  { x: 0, y: 1 },
  left:  { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

function tileAt(L, st, x, y) {
  if (y < 0 || y >= L.map.length) return null;
  const row = L.map[y];
  if (x < 0 || x >= row.length) return null;
  const ch = row[x];
  if (ch === '.') return null;
  if (ch >= '1' && ch <= '4') return st.bridges[ch] ? ch : null;
  if (ch === 'S') return '#';
  return ch;
}

function initState(li) {
  const L = LEVELS[li];
  let sx = 0, sy = 0;
  for (let y = 0; y < L.map.length; y++) {
    const x = L.map[y].indexOf('S');
    if (x >= 0) { sx = x; sy = y; }
  }
  const bridges = {};
  for (const row of L.map) {
    for (const ch of row) {
      if (ch >= '1' && ch <= '4' && !(ch in bridges)) {
        bridges[ch] = !!(L.bridgesOpen && L.bridgesOpen[ch]);
      }
    }
  }
  return {
    li, mode: 'block',
    box: { x: sx, y: sy, dx: 1, dy: 1, dz: 2 },
    cubes: null, active: 0,
    bridges, moves: 0, status: 'play',
  };
}

function cloneState(st) {
  return {
    ...st,
    box: st.box && { ...st.box },
    cubes: st.cubes && st.cubes.map(c => ({ ...c })),
    bridges: { ...st.bridges },
  };
}

// Roll a box (min corner x,y + dims dx,dy,dz) one step; a 1x1x1 cube just slides.
function rollBox(b, d) {
  const n = { ...b };
  if (d.x === 1)       { n.x = b.x + b.dx; n.dx = b.dz; n.dz = b.dx; }
  else if (d.x === -1) { n.dx = b.dz; n.dz = b.dx; n.x = b.x - n.dx; }
  else if (d.y === 1)  { n.y = b.y + b.dy; n.dy = b.dz; n.dz = b.dy; }
  else if (d.y === -1) { n.dy = b.dz; n.dz = b.dy; n.y = b.y - n.dy; }
  return n;
}

function footprint(b) {
  const cells = [];
  for (let x = b.x; x < b.x + b.dx; x++)
    for (let y = b.y; y < b.y + b.dy; y++) cells.push([x, y]);
  return cells;
}

function supported(L, st, b) {
  return footprint(b).every(([x, y]) => tileAt(L, st, x, y) !== null);
}

function allSupported(L, st) {
  if (st.mode === 'block') return supported(L, st, st.box);
  return st.cubes.every(c => supported(L, st, { x: c.x, y: c.y, dx: 1, dy: 1 }));
}

// Resolve what happens when box b comes to rest. Mutates st; returns 'ok'|'fall'|'win'.
function resolveLanding(L, st, b, isCube, ev) {
  if (!supported(L, st, b)) { ev.push({ t: 'fall' }); return 'fall'; }

  const standingBlock = !isCube && b.dz === 2 && b.dx === 1 && b.dy === 1;

  if (standingBlock) {
    const t = tileAt(L, st, b.x, b.y);
    if (t === 'G') { ev.push({ t: 'win' }); return 'win'; }
    if (t === 'o') { ev.push({ t: 'break', x: b.x, y: b.y }, { t: 'fall' }); return 'fall'; }
  }
  if (isCube) {
    const t = tileAt(L, st, b.x, b.y);
    if (t === 'G') { ev.push({ t: 'fall' }); return 'fall'; } // half a block tumbles in
  }

  // Switches: soft = any contact, hard = standing block only.
  let toggled = false;
  for (const [x, y] of footprint(b)) {
    const t = tileAt(L, st, x, y);
    if (!t) continue;
    const soft = t >= 'a' && t <= 'd';
    const hard = t >= 'A' && t <= 'D';
    if (soft || (hard && standingBlock)) {
      const def = L.switches && L.switches[t];
      if (def) {
        ev.push({ t: 'switch', x, y });
        for (const g of def.bridges) {
          st.bridges[g] = def.action === 'toggle' ? !st.bridges[g]
                        : def.action === 'open';
        }
        toggled = true;
      }
    }
  }
  // A toggled bridge may have vanished under the other half of a split block.
  if (toggled && !allSupported(L, st)) { ev.push({ t: 'fall' }); return 'fall'; }

  // Teleporter: a standing block splits into two half-cubes.
  if (standingBlock && tileAt(L, st, b.x, b.y) === 'T' && L.tele) {
    st.mode = 'split';
    st.cubes = [
      { x: L.tele[0][0], y: L.tele[0][1] },
      { x: L.tele[1][0], y: L.tele[1][1] },
    ];
    st.box = null;
    st.active = 0;
    ev.push({ t: 'split' });
  }
  return 'ok';
}

function tryMove(st, dirName) {
  if (st.status !== 'play') return null;
  const d = DIRS[dirName];
  const s = cloneState(st);
  const L = LEVELS[s.li];
  const ev = [];
  let res;

  if (s.mode === 'block') {
    const from = { ...s.box };
    s.box = rollBox(s.box, d);
    ev.unshift({ t: 'roll', from, to: { ...s.box }, dir: dirName, who: 'box' });
    res = resolveLanding(L, s, s.box, false, ev);
  } else {
    const i = s.active;
    const from = { x: s.cubes[i].x, y: s.cubes[i].y, dx: 1, dy: 1, dz: 1 };
    const nb = rollBox(from, d);
    s.cubes[i] = { x: nb.x, y: nb.y };
    ev.unshift({ t: 'roll', from, to: nb, dir: dirName, who: i });
    res = resolveLanding(L, s, nb, true, ev);
    if (res === 'ok') {
      const [c0, c1] = s.cubes;
      if (Math.abs(c0.x - c1.x) + Math.abs(c0.y - c1.y) === 1) {
        s.mode = 'block';
        s.box = {
          x: Math.min(c0.x, c1.x), y: Math.min(c0.y, c1.y),
          dx: Math.abs(c0.x - c1.x) + 1, dy: Math.abs(c0.y - c1.y) + 1, dz: 1,
        };
        s.cubes = null;
        ev.push({ t: 'merge' });
      }
    }
  }

  s.moves++;
  if (res === 'fall') s.status = 'dead';
  if (res === 'win') s.status = 'won';
  return { state: s, events: ev };
}

// Node export for the offline level solver; browsers continue to boot().
if (typeof document === 'undefined') {
  module.exports = { LEVELS, DIRS, PARS, initState, tryMove, cloneState };
} else {
  boot();
}

/* ============================== UI / RENDER ============================= */

function boot() {

const cv = document.getElementById('board');
const ctx = cv.getContext('2d');
const $ = id => document.getElementById(id);

const SAVE_KEY = 'bloxorz_save_v1';
let save = { unlocked: 0, best: {} };
try {
  const raw = localStorage.getItem(SAVE_KEY);
  if (raw) save = Object.assign(save, JSON.parse(raw));
} catch (e) {}
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {} }

let S = null;          // engine state
let falls = 0;         // falls on the current stage
let anim = null;       // active animation
let queued = [];       // buffered inputs (so quick swipes chain smoothly)
let heldDir = null;    // held pad/key: keeps rolling while held
let history = [];      // undo stack (survives a fall, so you can undo the fatal move)
let view = null;       // projection params

/* ---------- themes ---------- */
const THEMES = {
  slate: {   // the cool dark default
    tileA: '#9aa5b1', tileB: '#8d98a5', frA: '#d08a2e', frB: '#c47f27',
    brA: '#6f96ac', brB: '#648ba1', block: '#d6a032', cube: '#8d7a4e',
    blockOutline: '#221405', cubeOutline: '#15100a',
    tileEdge: '#0b0e13', sideEdge: '#05070a',
    hole: '#040507', holeRim: '#2a3340',
    swFill: '#3d4653', swRim: '#12161d', hardX: '#2a313c',
    tel: '#e8edf3', closedBr: '#5a7d93',
  },
  classic: { // red felt, silver stone tiles, rusted iron block
    tileA: '#dcddd5', tileB: '#cfd0c8', frA: '#e0913a', frB: '#d48630',
    brA: '#a9aaa2', brB: '#9d9e96', block: '#6b3120', cube: '#8a6a58',
    blockOutline: '#26100a', cubeOutline: '#26100a',
    tileEdge: '#6f7069', sideEdge: '#3c3d38',
    hole: '#0c0805', holeRim: '#55564f',
    swFill: '#a3a49a', swRim: '#5b5c54', hardX: '#83847b',
    tel: '#3a3b35', closedBr: '#b9bab2',
  },
  mono: {    // black & white
    tileA: '#d8d8d8', tileB: '#c9c9c9', frA: '#7f7f7f', frB: '#747474',
    brA: '#ffffff', brB: '#f2f2f2', block: '#fafafa', cube: '#9a9a9a',
    blockOutline: '#0a0a0a', cubeOutline: '#0a0a0a',
    tileEdge: '#000000', sideEdge: '#000000',
    hole: '#000000', holeRim: '#5a5a5a',
    swFill: '#2e2e2e', swRim: '#000000', hardX: '#1a1a1a',
    tel: '#111111', closedBr: '#9a9a9a',
  },
};
let theme = THEMES[save.theme] || THEMES.slate;

function setTheme(name) {
  if (!THEMES[name]) return;
  theme = THEMES[name];
  save.theme = name;
  persist();
  document.body.dataset.theme = name;
  document.querySelectorAll('.themebtn').forEach(b =>
    b.classList.toggle('active', b.dataset.theme === name));
  if (S) draw();
}

/* ---------- sound (WebAudio, generated) ---------- */
let soundOn = save.sound !== false;
let AC = null;
function ac() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function tone(freq, dur, type, vol, when) {
  if (!soundOn) return;
  const a = ac(); if (!a) return;
  const t = a.currentTime + (when || 0);
  const o = a.createOscillator(), g = a.createGain();
  o.type = type || 'sine'; o.frequency.value = freq;
  g.gain.setValueAtTime(vol || 0.15, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(a.destination);
  o.start(t); o.stop(t + dur);
}
const snd = {
  roll:   () => tone(120 + Math.random() * 40, 0.07, 'triangle', 0.12),
  switch: () => { tone(660, 0.06, 'square', 0.08); tone(880, 0.08, 'square', 0.06, 0.06); },
  break_: () => tone(200, 0.25, 'sawtooth', 0.1),
  fall:   () => { tone(300, 0.5, 'sine', 0.12); tone(150, 0.6, 'sine', 0.1, 0.1); },
  split:  () => { tone(520, 0.1, 'sine', 0.1); tone(780, 0.12, 'sine', 0.1, 0.08); },
  win:    () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'sine', 0.12, i * 0.11)); },
};

/* ---------- projection ---------- */
const THICK = 0.28;                       // tile slab thickness
const VIEW_V = norm3([1, 1, 1.6]);        // toward-camera vector (visibility)
const LIGHT = norm3([0.25, 0.45, 0.86]);

function norm3(v) {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
}

function computeView() {
  const L = LEVELS[S.li];
  const W = Math.max(...L.map.map(r => r.length));
  const H = L.map.length;
  const cw = cv.width, ch = cv.height;
  const pad = Math.min(cw, ch) * 0.07;
  // X = (x - y) * ux ; Y = (x + y) * uy - z * uz
  const RY = 0.52, RZ = 0.96;
  const s = Math.min(
    (cw - pad * 2) / (W + H),
    (ch - pad * 2) / ((W + H) * RY + (2 + THICK) * RZ)
  );
  const ux = s, uy = s * RY, uz = s * RZ;
  // center the board's projected bounding box
  const minX = -H * ux, maxX = W * ux;
  const minY = -2 * uz, maxY = (W + H) * uy + THICK * uz;
  view = {
    ux, uy, uz,
    ox: cw / 2 - (minX + maxX) / 2,
    oy: ch / 2 - (minY + maxY) / 2,
  };
}

function proj(x, y, z) {
  return [
    view.ox + (x - y) * view.ux,
    view.oy + (x + y) * view.uy - z * view.uz,
  ];
}

/* ---------- drawing ---------- */
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * f));
  const g = Math.min(255, Math.round(((n >> 8) & 255) * f));
  const b = Math.min(255, Math.round((n & 255) * f));
  return `rgb(${r},${g},${b})`;
}

function poly(pts, fill, stroke, lw) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1; ctx.stroke(); }
}

function drawSlab(x, y, top, dropZ, alpha) {
  const z0 = -(dropZ || 0);
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  const A = proj(x, y, z0), B = proj(x + 1, y, z0),
        C = proj(x + 1, y + 1, z0), D = proj(x, y + 1, z0);
  const Bt = proj(x + 1, y, z0 - THICK), Ct = proj(x + 1, y + 1, z0 - THICK),
        Dt = proj(x, y + 1, z0 - THICK);
  poly([D, C, Ct, Dt], shade(top, 0.55), theme.sideEdge, 1);   // front-left face
  poly([B, C, Ct, Bt], shade(top, 0.42), theme.sideEdge, 1);   // front-right face
  poly([A, B, C, D], top, theme.tileEdge, 1.5);                // top
  ctx.globalAlpha = 1;
}

function tileTopColor(ch, x, y) {
  const alt = (x + y) % 2 === 0;
  if (ch === 'o') return alt ? theme.frA : theme.frB;
  if (ch >= '1' && ch <= '4') return alt ? theme.brA : theme.brB;
  return alt ? theme.tileA : theme.tileB;
}

function drawGlyphs(ch, x, y) {
  const c = proj(x + 0.5, y + 0.5, 0);
  if (ch === 'G') {
    // the goal hole: dark inset diamond
    const m = 0.2;
    poly([proj(x + m, y + m, 0), proj(x + 1 - m, y + m, 0),
          proj(x + 1 - m, y + 1 - m, 0), proj(x + m, y + 1 - m, 0)],
      theme.hole, theme.holeRim, 1.5);
  } else if (ch >= 'a' && ch <= 'd') {
    ctx.beginPath();
    ctx.ellipse(c[0], c[1], view.ux * 0.26, view.uy * 0.26, 0, 0, Math.PI * 2);
    ctx.fillStyle = theme.swFill; ctx.fill();
    ctx.strokeStyle = theme.swRim; ctx.lineWidth = 2; ctx.stroke();
  } else if (ch >= 'A' && ch <= 'D') {
    const m = 0.24;
    ctx.strokeStyle = theme.hardX; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.beginPath();
    let p = proj(x + m, y + m, 0); ctx.moveTo(p[0], p[1]);
    p = proj(x + 1 - m, y + 1 - m, 0); ctx.lineTo(p[0], p[1]);
    p = proj(x + 1 - m, y + m, 0); ctx.moveTo(p[0], p[1]);
    p = proj(x + m, y + 1 - m, 0); ctx.lineTo(p[0], p[1]);
    ctx.stroke(); ctx.lineCap = 'butt';
  } else if (ch === 'T') {
    for (const [ox, oy] of [[0.32, 0.5], [0.68, 0.5]]) {
      const q = proj(x + ox, y + oy, 0);
      ctx.beginPath();
      ctx.ellipse(q[0], q[1], view.ux * 0.11, view.uy * 0.11, 0, 0, Math.PI * 2);
      ctx.fillStyle = theme.tel; ctx.fill();
    }
  }
}

// 8 box corners; bit0 = +x, bit1 = +y, bit2 = +z
function boxCorners(b) {
  const cs = [];
  for (let i = 0; i < 8; i++) {
    cs.push([
      b.x + ((i & 1) ? b.dx : 0),
      b.y + ((i & 2) ? b.dy : 0),
      (i & 4) ? b.dz : 0,
    ]);
  }
  return cs;
}

function rotateCorners(cs, dir, pivot, th) {
  const s = Math.sin(th), c = Math.cos(th);
  return cs.map(([x, y, z]) => {
    if (dir === 'right') return [pivot + (x - pivot) * c + z * s, y, -(x - pivot) * s + z * c];
    if (dir === 'left')  return [pivot + (x - pivot) * c - z * s, y, (x - pivot) * s + z * c];
    if (dir === 'down')  return [x, pivot + (y - pivot) * c + z * s, -(y - pivot) * s + z * c];
    /* up */             return [x, pivot + (y - pivot) * c - z * s, (y - pivot) * s + z * c];
  });
}

const FACES = [
  [0, 1, 3, 2], [4, 5, 7, 6],
  [0, 1, 5, 4], [2, 3, 7, 6],
  [0, 2, 6, 4], [1, 3, 7, 5],
];

function drawBox(cs, base, outline, alpha) {
  if (alpha !== undefined) ctx.globalAlpha = alpha;
  const cx = cs.reduce((a, p) => a + p[0], 0) / 8;
  const cy = cs.reduce((a, p) => a + p[1], 0) / 8;
  const cz = cs.reduce((a, p) => a + p[2], 0) / 8;
  for (const f of FACES) {
    const [p0, p1, p2] = [cs[f[0]], cs[f[1]], cs[f[2]]];
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    let n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const fc = f.reduce((a, i) => [a[0] + cs[i][0] / 4, a[1] + cs[i][1] / 4, a[2] + cs[i][2] / 4], [0, 0, 0]);
    const out = [fc[0] - cx, fc[1] - cy, fc[2] - cz];
    if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
    n = norm3(n);
    if (n[0] * VIEW_V[0] + n[1] * VIEW_V[1] + n[2] * VIEW_V[2] <= 0.001) continue;
    const lum = Math.max(0, n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2]);
    poly(f.map(i => proj(cs[i][0], cs[i][1], cs[i][2])),
      shade(base, 0.45 + 0.6 * lum), outline, 2);
  }
  ctx.globalAlpha = 1;
}

// Per-tile offset/alpha while the level is assembling or crumbling,
// staggered along the board diagonal so it ripples across the floor.
function tileFxAt(x, y) {
  if (!anim || (anim.type !== 'build' && anim.type !== 'crumble')) return null;
  const T = anim.t * anim.dur;
  const p = Math.max(0, Math.min(1, (T - (x + y) * anim.stag) / anim.tileMs));
  if (anim.type === 'build') {
    return { dz: -(1 - p) * (1 - p) * 7, alpha: p * p, p }; // drop in from above
  }
  return { dz: p * p * 10, alpha: 1 - p, p };               // fall away below
}

function renderTile(x, y, ch) {
  if (ch >= '1' && ch <= '4' && !S.bridges[ch]) {
    const fx = tileFxAt(x, y);
    if (fx && fx.p < 1) return;
    // closed bridge: faint outline only
    ctx.globalAlpha = 0.18;
    poly([proj(x, y, 0), proj(x + 1, y, 0), proj(x + 1, y + 1, 0), proj(x, y + 1, 0)],
      null, theme.closedBr, 1.5);
    ctx.globalAlpha = 1;
    return;
  }
  if (anim && anim.type === 'fallBreak' && anim.bx === x && anim.by === y) {
    drawSlab(x, y, tileTopColor(ch, x, y), anim.zoff, Math.max(0, 1 - anim.t));
    return;
  }
  const eff = ch === 'S' ? '#' : ch;
  const fx = tileFxAt(x, y);
  if (fx) {
    if (fx.p <= 0) return;
    drawSlab(x, y, tileTopColor(eff, x, y), fx.dz, fx.alpha);
    if (fx.p >= 1) drawGlyphs(eff, x, y);
    return;
  }
  drawSlab(x, y, tileTopColor(eff, x, y));
  drawGlyphs(eff, x, y);
}

function draw() {
  const L = LEVELS[S.li];
  ctx.clearRect(0, 0, cv.width, cv.height);

  const tiles = [];
  for (let y = 0; y < L.map.length; y++) {
    for (let x = 0; x < L.map[y].length; x++) {
      const ch = L.map[y][x];
      if (ch === '.') continue;
      tiles.push([x, y, ch]);
    }
  }
  tiles.sort((a, b) => (a[0] + a[1]) - (b[0] + b[1]));

  // While falling, tiles level with or in front of the block's column are
  // drawn AFTER it, so the block drops behind the floor instead of over it.
  const isFall = anim && (anim.type === 'fall' || anim.type === 'fallBreak');
  const frontSum = isFall ? anim.frontSum : Infinity;
  for (const [x, y, ch] of tiles) if (x + y < frontSum) renderTile(x, y, ch);
  drawEntities();
  if (isFall) for (const [x, y, ch] of tiles) if (x + y >= frontSum) renderTile(x, y, ch);
}

function drawEntities() {
  const BLOCK = theme.block, CUBE_IDLE = theme.cube;
  if (anim && anim.type === 'crumble') return; // the block already fell
  if (anim && anim.type === 'build') {
    // the block (or cubes) drops in along with its own row of tiles
    const boxes = S.mode === 'block'
      ? [[S.box, BLOCK]]
      : S.cubes.map((c, i) => [{ x: c.x, y: c.y, dx: 1, dy: 1, dz: 1 },
                               i === S.active ? BLOCK : CUBE_IDLE]);
    boxes.sort((a, b) => (a[0].x + a[0].y) - (b[0].x + b[0].y));
    for (const [b, col] of boxes) {
      const fx = tileFxAt(b.x, b.y);
      if (fx && fx.p <= 0) continue;
      const dz = fx ? fx.dz : 0, al = fx ? fx.alpha : 1;
      drawBox(boxCorners(b).map(p => [p[0], p[1], p[2] - dz]), col, theme.blockOutline, al);
    }
    return;
  }
  if (anim && (anim.type === 'roll')) {
    // ease-in: the block tips slowly then falls onto its face, like gravity
    const th = Math.pow(anim.t, 1.55) * Math.PI / 2;
    const cs = rotateCorners(boxCorners(anim.from), anim.dir, anim.pivot, th);
    drawOthers(anim.who, BLOCK, CUBE_IDLE);
    drawBox(cs, anim.who === 'box' || anim.who === S.active ? BLOCK : CUBE_IDLE, theme.blockOutline);
  } else if (anim && (anim.type === 'fall' || anim.type === 'fallBreak')) {
    let cs = anim.pose.map(p => [p[0], p[1], p[2] - anim.zoff]);
    drawOthers(anim.who, BLOCK, CUBE_IDLE);
    drawBox(cs, BLOCK, theme.blockOutline, Math.max(0, 1 - anim.t * anim.t));
  } else if (anim && anim.type === 'sink') {
    const b = { ...S.box, dz: S.box.dz };
    const cs = boxCorners(b).map(p => [p[0], p[1], p[2] - anim.t * 2.2]);
    drawBox(cs, BLOCK, theme.blockOutline, Math.max(0, 1 - anim.t));
  } else if (S.mode === 'block') {
    drawBox(boxCorners(S.box), BLOCK, theme.blockOutline);
  } else {
    const order = [...S.cubes.keys()].sort((a, b) =>
      (S.cubes[a].x + S.cubes[a].y) - (S.cubes[b].x + S.cubes[b].y));
    for (const i of order) {
      const c = S.cubes[i];
      drawBox(boxCorners({ x: c.x, y: c.y, dx: 1, dy: 1, dz: 1 }),
        i === S.active ? BLOCK : CUBE_IDLE, i === S.active ? theme.blockOutline : theme.cubeOutline);
    }
  }
}

function drawOthers(who, BLOCK, CUBE_IDLE) {
  // while one half-cube animates, keep the other visible
  if (who === 'box' || !S.cubes) return;
  const other = 1 - who;
  const c = S.cubes[other];
  if (!c) return;
  drawBox(boxCorners({ x: c.x, y: c.y, dx: 1, dy: 1, dz: 1 }),
    other === S.active ? BLOCK : CUBE_IDLE, theme.cubeOutline);
}

/* ---------- animation / game flow ---------- */
const ROLL_MS = 150, FALL_MS = 650, SINK_MS = 550;

function pivotFor(from, dir) {
  if (dir === 'right') return from.x + from.dx;
  if (dir === 'left') return from.x;
  if (dir === 'down') return from.y + from.dy;
  return from.y;
}

let pending = null; // {state, events} applied when roll anim ends

function step(dirName) {
  if (!S || S.status !== 'play') return;
  if (anim) { if (queued.length < 2) queued.push(dirName); return; }
  const r = tryMove(S, dirName);
  if (!r) return;
  const rollEv = r.events[0];
  pending = r;
  snd.roll();
  anim = {
    type: 'roll', t: 0, t0: performance.now(), dur: ROLL_MS,
    from: rollEv.from, dir: dirName, pivot: pivotFor(rollEv.from, dirName),
    who: rollEv.who,
  };
  requestAnimationFrame(tick);
}

function applyPending() {
  const r = pending; pending = null;
  const evs = r.events;
  history.push(cloneState(S));
  if (history.length > 300) history.shift();
  S = r.state;
  updateHud();

  const brk = evs.find(e => e.t === 'break');
  if (evs.some(e => e.t === 'switch')) snd.switch();
  if (evs.some(e => e.t === 'split')) { snd.split(); toast('SPLIT — use the swap button'); }
  if (evs.some(e => e.t === 'merge')) snd.split();
  updateSwap();

  if (S.status === 'dead') {
    snd.fall(); if (brk) snd.break_();
    const b = lastPose(r);
    anim = {
      type: brk ? 'fallBreak' : 'fall', t: 0, t0: performance.now(), dur: FALL_MS,
      pose: boxCorners(b), zoff: 0, who: evs[0].who,
      bx: brk && brk.x, by: brk && brk.y,
      frontSum: Math.min(...footprint(b).map(([x, y]) => x + y)),
    };
    requestAnimationFrame(tick);
    return;
  }
  if (S.status === 'won') {
    snd.win();
    anim = { type: 'sink', t: 0, t0: performance.now(), dur: SINK_MS };
    requestAnimationFrame(tick);
    return;
  }
  if (queued.length) step(queued.shift());
  else if (heldDir) step(heldDir);
}

function lastPose(r) {
  const roll = r.events[0];
  if (roll.who === 'box') return r.state.box || roll.to;
  return { x: roll.to.x, y: roll.to.y, dx: 1, dy: 1, dz: 1 };
}

function tick(now) {
  if (!anim) { draw(); return; }
  anim.t = Math.min(1, (now - anim.t0) / anim.dur);
  if (anim.type === 'fall' || anim.type === 'fallBreak') {
    anim.zoff = anim.t * anim.t * 9;
  }
  draw();
  if (anim.t < 1) { requestAnimationFrame(tick); return; }
  const was = anim.type;
  anim = null;
  if (was === 'roll') { applyPending(); draw(); return; }
  if (was === 'fall' || was === 'fallBreak') {
    falls++;
    queued = [];
    heldDir = null; // don't march straight back off the edge
    startCrumble();
    return;
  }
  if (was === 'crumble') {
    S = initState(S.li);
    computeView(); updateHud(); updateSwap();
    startBuild();
    return;
  }
  if (was === 'build') {
    draw();
    if (queued.length) step(queued.shift());
    else if (heldDir) step(heldDir);
    return;
  }
  if (was === 'sink') { levelComplete(); }
}

function levelMaxSum() {
  const L = LEVELS[S.li];
  let m = 0;
  for (let y = 0; y < L.map.length; y++)
    for (let x = 0; x < L.map[y].length; x++)
      if (L.map[y][x] !== '.') m = Math.max(m, x + y);
  return m;
}

function startBuild() {
  const stag = 26, tileMs = 300;
  anim = { type: 'build', t: 0, t0: performance.now(),
           dur: levelMaxSum() * stag + tileMs, stag, tileMs };
  requestAnimationFrame(tick);
}

function startCrumble() {
  const stag = 18, tileMs = 260;
  anim = { type: 'crumble', t: 0, t0: performance.now(),
           dur: levelMaxSum() * stag + tileMs, stag, tileMs };
  requestAnimationFrame(tick);
}

function levelComplete() {
  const li = S.li;
  const prevBest = save.best[li];
  if (prevBest === undefined || S.moves < prevBest) save.best[li] = S.moves;
  if (li + 1 > save.unlocked) save.unlocked = Math.min(li + 1, LEVELS.length - 1);
  persist();
  $('doneMoves').textContent = S.moves;
  $('doneBest').textContent = save.best[li];
  $('donePar').textContent = PARS[li];
  const last = li === LEVELS.length - 1;
  $('doneCode').textContent = last ? '' : 'PASSCODE  ' + LEVELS[li + 1].code;
  $('doneTitle').textContent = last ? 'ALL STAGES CLEAR' : 'STAGE COMPLETE';
  $('btnNext').textContent = last ? 'MENU' : 'CONTINUE';
  show('done');
}

function startLevel(li) {
  S = initState(li);
  falls = 0; anim = null; queued = []; pending = null; heldDir = null;
  history = [];
  computeView(); updateHud(); updateSwap();
  startBuild();
}

function undo() {
  if (!S || anim || S.status !== 'play' || !history.length) return;
  S = history.pop();
  S.status = 'play';
  queued = []; heldDir = null;
  updateHud(); updateSwap(); draw();
}

/* ---------- HUD / overlays ---------- */
function updateHud() {
  $('hudStage').textContent =
    'STAGE ' + String(S.li + 1).padStart(2, '0') + '/' + LEVELS.length;
  $('hudMoves').textContent = S.moves;
  $('hudFalls').textContent = falls;
  $('btnUndo').classList.toggle('disabled', !history.length);
}
function updateSwap() {
  $('btnSwap').classList.toggle('hidden', !S || S.mode !== 'split');
}
function show(id) { $(id).classList.add('show'); }
function hide(id) { $(id).classList.remove('show'); }

let toastTimer = null;
function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

function buildLevelGrid() {
  const grid = $('levelGrid');
  grid.innerHTML = '';
  for (let i = 0; i < LEVELS.length; i++) {
    const b = document.createElement('button');
    b.className = 'lvl';
    const locked = i > save.unlocked;
    b.textContent = locked ? '·' : String(i + 1);
    if (locked) b.classList.add('locked');
    else if (save.best[i] !== undefined) {
      b.classList.add('cleared');
      const s = document.createElement('small');
      s.textContent = save.best[i];
      b.appendChild(s);
    }
    b.disabled = locked;
    b.addEventListener('click', () => { hide('levels'); startLevel(i); });
    grid.appendChild(b);
  }
}

/* ---------- input ---------- */
const KEYMAP = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
                 w: 'up', s: 'down', a: 'left', d: 'right' };
document.addEventListener('keydown', e => {
  const k = e.key;
  if (KEYMAP[k]) {
    e.preventDefault();
    if (e.repeat) return;      // we do our own hold-repeat, synced to the roll
    heldDir = KEYMAP[k];
    step(heldDir);
  } else if (k === ' ' || k === 'Enter') {
    if (S && S.mode === 'split' && !anim) { S.active = 1 - S.active; draw(); }
  } else if (k === 'r') { startLevel(S.li); }
  else if (k === 'z' || k === 'u') { undo(); }
});
document.addEventListener('keyup', e => {
  if (KEYMAP[e.key] === heldDir) heldDir = null;
});

document.querySelectorAll('#dpad .pad[data-dir]').forEach(b => {
  b.addEventListener('pointerdown', e => {
    e.preventDefault();
    heldDir = b.dataset.dir;
    step(heldDir);
  });
});
for (const ev of ['pointerup', 'pointercancel']) {
  document.addEventListener(ev, () => { heldDir = null; });
}
$('btnSwap').addEventListener('pointerdown', e => {
  e.preventDefault();
  if (S && S.mode === 'split' && !anim) { S.active = 1 - S.active; draw(); }
});

// swipe: anywhere on screen, fires the moment the gesture is clear (no
// waiting for the finger to lift), mapped to the nearest isometric axis
function dirFromVector(dx, dy) {
  const dirsScreen = {
    right: [view.ux, view.uy], left: [-view.ux, -view.uy],
    down: [-view.ux, view.uy], up: [view.ux, -view.uy],
  };
  let best = null, bestDot = -Infinity;
  const len = Math.hypot(dx, dy);
  for (const [name, v] of Object.entries(dirsScreen)) {
    const vl = Math.hypot(v[0], v[1]);
    const dot = (dx * v[0] + dy * v[1]) / (len * vl);
    if (dot > bestDot) { bestDot = dot; best = name; }
  }
  return best;
}
let swipe = null;
document.addEventListener('touchstart', e => {
  if (e.target.closest('button, .overlay, input, #hud')) { swipe = null; return; }
  const t = e.touches[0];
  swipe = { x: t.clientX, y: t.clientY, fired: false };
}, { passive: true });
document.addEventListener('touchmove', e => {
  if (!swipe || swipe.fired) return;
  const t = e.touches[0];
  const dx = t.clientX - swipe.x, dy = t.clientY - swipe.y;
  if (Math.hypot(dx, dy) < 26) return;
  swipe.fired = true;
  step(dirFromVector(dx, dy));
}, { passive: true });
document.addEventListener('touchend', () => {
  // a tap (no swipe) on the board swaps halves while split
  if (swipe && !swipe.fired && S && S.mode === 'split' && !anim && S.status === 'play') {
    S.active = 1 - S.active;
    draw();
  }
  swipe = null;
}, { passive: true });

/* ---------- buttons / screens ---------- */
function updateSoundBtn() {
  $('btnSound').textContent = 'SOUND: ' + (soundOn ? 'ON' : 'OFF');
  $('btnSound').classList.toggle('muted', !soundOn);
}
$('btnSound').addEventListener('click', () => {
  soundOn = !soundOn;
  save.sound = soundOn;
  persist();
  updateSoundBtn();
  if (soundOn) snd.switch();
});
updateSoundBtn();

$('btnSettings').addEventListener('click', () => show('settings'));
$('btnCloseSettings').addEventListener('click', () => hide('settings'));

$('btnReset').addEventListener('click', () => { if (S) startLevel(S.li); });
$('btnUndo').addEventListener('click', undo);

// keep the screen awake during play (supported on iOS 16.4+; harmless elsewhere)
let wakeLock = null;
async function keepAwake() {
  try {
    if ('wakeLock' in navigator) wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {}
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') keepAwake();
});
$('btnLevels').addEventListener('click', () => { buildLevelGrid(); show('levels'); });
$('btnCloseLevels').addEventListener('click', () => hide('levels'));
$('btnPlay').addEventListener('click', () => {
  ac();
  keepAwake();
  hide('intro');
  startLevel(Math.min(save.unlocked, LEVELS.length - 1));
});
$('btnNext').addEventListener('click', () => {
  hide('done');
  if (S.li === LEVELS.length - 1) { buildLevelGrid(); show('levels'); }
  else startLevel(S.li + 1);
});
document.querySelectorAll('.themebtn').forEach(b => {
  b.addEventListener('click', () => setTheme(b.dataset.theme));
});

$('btnCode').addEventListener('click', () => {
  const v = $('codeInput').value.trim();
  const idx = LEVELS.findIndex(L => L.code === v);
  if (idx < 0) { toast('UNKNOWN PASSCODE'); return; }
  if (idx > save.unlocked) { save.unlocked = idx; persist(); }
  $('codeInput').value = '';
  hide('levels');
  startLevel(idx);
});

/* ---------- resize / boot ---------- */
function resize() {
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const r = cv.getBoundingClientRect();
  cv.width = Math.round(r.width * dpr);
  cv.height = Math.round(r.height * dpr);
  if (S) { computeView(); draw(); }
}
window.addEventListener('resize', resize);
resize();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

setTheme(save.theme && THEMES[save.theme] ? save.theme : 'slate');
show('intro');
S = initState(Math.min(save.unlocked, LEVELS.length - 1));
computeView(); updateHud(); updateSwap(); draw();

} // boot
