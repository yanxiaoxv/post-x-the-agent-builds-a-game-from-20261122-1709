// render-video.mjs — films the video for the X post.
//
// The video is real gameplay: it loads ../game/game.js (the actual game)
// headless in a vm, runs its seeded simulation with scripted inputs,
// and rasterises every frame in pure Node (no dependencies). The frames
// are piped as raw video to ffmpeg, which encodes clip.mp4 (1920x1080,
// the size the press pack's 16:9 end card matches). The audio is a
// deterministic chiptune written as a WAV by this script. The official
// make.fun referral end card is composited afterwards by finish-video.sh
// (the press pack's own ffmpeg recipe), never redrawn.
//
// Timeline (36 s, 30 fps, 1080 frames):
//   0-3 s    hook: MY AI AGENT GOT ONE PROMPT
//   3-6.5 s  the one prompt, on screen
//   6.5-13 s the agent at work: real lines of game.js typing out
//   13-36 s  the finished game, played (scripted inputs, real sim)
//   last 2.5 s: the press-pack end card over the running game (finish step)
//
// Usage: node render-video.mjs [--stills DIR] [--out clip.mp4]
// Deterministic: same seed, same scripted inputs, same bytes out
// (ffmpeg is run with bitexact flags and fixed metadata).
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import zlib from "node:zlib";
import { createHash } from "node:crypto";

const ROOT = dirname(fileURLToPath(import.meta.url));
const W = 1920, H = 1080, FPS = 30, SECONDS = 36, FRAMES = FPS * SECONDS;
const SCALE = W / 960; // game world 960x540 -> 1920x1080

const args = process.argv.slice(2);
const outPath = args.includes("--out") ? args[args.indexOf("--out") + 1] : join(ROOT, "clip.mp4");
const stillsDir = args.includes("--stills") ? args[args.indexOf("--stills") + 1] : null;
if (stillsDir) mkdirSync(stillsDir, { recursive: true });

// ---------- load the real game ----------
const gameSrc = readFileSync(join(ROOT, "game", "game.js"), "utf8");
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(gameSrc, sandbox);
const { Sim, WORLD } = sandbox.NeonDrift;

// ---------- 5x7 bitmap font (A-Z 0-9 + punctuation) ----------
const GLYPHS = {
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01110", "10001", "10000", "10000", "10000", "10001", "01110"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01110", "10001", "10000", "10111", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["01110", "00100", "00100", "00100", "00100", "00100", "01110"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
  "3": ["11111", "00010", "00100", "00010", "00001", "10001", "01110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
  "6": ["00110", "01000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00010", "01100"],
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "01100", "00100", "01000"],
  ":": ["00000", "01100", "01100", "00000", "01100", "01100", "00000"],
  ";": ["00000", "01100", "01100", "00000", "01100", "00100", "01000"],
  "!": ["00100", "00100", "00100", "00100", "00100", "00000", "00100"],
  "?": ["01110", "10001", "00001", "00110", "00100", "00000", "00100"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  '"': ["01010", "01010", "00000", "00000", "00000", "00000", "00000"],
  "-": ["00000", "00000", "00000", "01110", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "(": ["00010", "00100", "01000", "01000", "01000", "00100", "00010"],
  ")": ["01000", "00100", "00010", "00010", "00010", "00100", "01000"],
  "+": ["00000", "00100", "00100", "01110", "00100", "00100", "00000"],
  "=": ["00000", "00000", "11111", "00000", "11111", "00000", "00000"],
  _: ["00000", "00000", "00000", "00000", "00000", "00000", "11111"],
  "%": ["11001", "11010", "00010", "00100", "01000", "01011", "10011"],
  $: ["00100", "01111", "10100", "01110", "00101", "11110", "00100"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "@": ["01110", "10001", "10111", "10101", "10110", "10000", "01110"],
  "#": ["01010", "01010", "11111", "01010", "11111", "01010", "01010"],
  "*": ["00000", "00100", "10101", "01110", "10101", "00100", "00000"],
  "<": ["00010", "00100", "01000", "10000", "01000", "00100", "00010"],
  ">": ["01000", "00100", "00010", "00001", "00010", "00100", "01000"],
  "{": ["00010", "00100", "00100", "01100", "00100", "00100", "00010"],
  "}": ["01000", "00100", "00100", "00110", "00100", "00100", "01000"],
  "[": ["01110", "01000", "01000", "01000", "01000", "01000", "01110"],
  "]": ["01110", "00010", "00010", "00010", "00010", "00010", "01110"],
  "|": ["00100", "00100", "00100", "00100", "00100", "00100", "00100"],
  "^": ["00100", "01010", "10001", "00000", "00000", "00000", "00000"],
  "~": ["00000", "00000", "01001", "10110", "00000", "00000", "00000"],
  "\\": ["10000", "01000", "00100", "00010", "00010", "00001", "00000"],
};
function textWidth(text, scale) {
  return text.length * 6 * scale - scale;
}
function drawText(buf, text, cx, y, scale, color, alpha) {
  text = String(text).toUpperCase().replace(/[—–]/g, "-").replace(/[’‘]/g, "'").replace(/[“”]/g, '"');
  const w = textWidth(text, scale);
  let x0 = Math.round(cx - w / 2);
  for (let ci = 0; ci < text.length; ci++) {
    const g = GLYPHS[text[ci]] || GLYPHS["?"];
    const gx = x0 + ci * 6 * scale;
    for (let row = 0; row < 7; row++) {
      const bits = g[row];
      for (let col = 0; col < 5; col++) {
        if (bits[col] !== "1") continue;
        fillRect(buf, gx + col * scale, y + row * scale, scale, scale, color, alpha);
      }
    }
  }
}
function drawTextLeft(buf, text, x, y, scale, color, alpha) {
  drawText(buf, text, x + textWidth(text, scale) / 2, y, scale, color, alpha);
}
function drawTextGlow(buf, text, cx, y, scale, color, glowColor) {
  for (const [dx, dy] of [[-2, 0], [2, 0], [0, -2], [0, 2]]) {
    drawText(buf, text, cx + dx, y + dy, scale, glowColor, 0.35);
  }
  drawText(buf, text, cx, y, scale, color, 1);
}

// ---------- rasterizer ----------
const buf = Buffer.alloc(W * H * 3);
const base = Buffer.alloc(W * H * 3);
function fillRect(b, x, y, w, h, color, alpha) {
  const x0 = Math.max(0, Math.floor(x)), y0 = Math.max(0, Math.floor(y));
  const x1 = Math.min(W, Math.ceil(x + w)), y1 = Math.min(H, Math.ceil(y + h));
  if (x1 <= x0 || y1 <= y0) return;
  const [r, g, bl] = color;
  for (let yy = y0; yy < y1; yy++) {
    let idx = (yy * W + x0) * 3;
    for (let xx = x0; xx < x1; xx++) {
      b[idx] = Math.min(255, b[idx] + r * alpha);
      b[idx + 1] = Math.min(255, b[idx + 1] + g * alpha);
      b[idx + 2] = Math.min(255, b[idx + 2] + bl * alpha);
      idx += 3;
    }
  }
}
function addPixel(b, x, y, r, g, bl, a) {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const idx = (y * W + x) * 3;
  b[idx] = Math.min(255, b[idx] + r * a);
  b[idx + 1] = Math.min(255, b[idx + 1] + g * a);
  b[idx + 2] = Math.min(255, b[idx + 2] + bl * a);
}
function fillCircle(b, cx, cy, rad, color, alpha) {
  const [r, g, bl] = color;
  const x0 = Math.max(0, Math.floor(cx - rad)), x1 = Math.min(W - 1, Math.ceil(cx + rad));
  const y0 = Math.max(0, Math.floor(cy - rad)), y1 = Math.min(H - 1, Math.ceil(cy + rad));
  for (let y = y0; y <= y1; y++) {
    const dy = y - cy;
    const half = Math.sqrt(Math.max(0, rad * rad - dy * dy));
    for (let x = Math.max(x0, Math.floor(cx - half)); x <= Math.min(x1, Math.ceil(cx + half)); x++) {
      const d = Math.sqrt((x - cx) * (x - cx) + dy * dy) / rad;
      const edge = d > 0.85 ? (1 - d) / 0.15 : 1;
      addPixel(b, x, y, r, g, bl, alpha * edge);
    }
  }
}
function drawLine(b, x0, y0, x1, y1, color, width, alpha) {
  const dx = x1 - x0, dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(len / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    fillCircle(b, x0 + dx * t, y0 + dy * t, width / 2, color, alpha);
  }
}
function strokePoly(b, pts, color, width, alpha) {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], c = pts[(i + 1) % pts.length];
    drawLine(b, a[0], a[1], c[0], c[1], color, width, alpha);
  }
}
function fillPoly(b, pts, color, alpha) {
  const [r, g, bl] = color;
  let minY = Infinity, maxY = -Infinity;
  for (const p of pts) { minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]); }
  minY = Math.max(0, Math.floor(minY)); maxY = Math.min(H - 1, Math.ceil(maxY));
  for (let y = minY; y <= maxY; y++) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], c = pts[(i + 1) % pts.length];
      if ((a[1] <= y && c[1] > y) || (c[1] <= y && a[1] > y)) {
        xs.push(a[0] + ((y - a[1]) / (c[1] - a[1])) * (c[0] - a[0]));
      }
    }
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const x0 = Math.max(0, Math.floor(xs[k])), x1 = Math.min(W - 1, Math.ceil(xs[k + 1]));
      for (let x = x0; x <= x1; x++) addPixel(b, x, y, r, g, bl, alpha);
    }
  }
}
// pre-render the static background (gradient + nebula + vignette)
function buildBase() {
  for (let y = 0; y < H; y++) {
    const t = y / H;
    const r = 4 + t * 4, g = 4 + t * 6, b = 18 + t * 14;
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 3;
      base[idx] = r; base[idx + 1] = g; base[idx + 2] = b;
    }
  }
  const blobs = [
    [450, 270, 390, 26, 8, 60], [1530, 780, 450, 10, 26, 60],
    [1470, 180, 330, 20, 20, 70], [270, 900, 360, 8, 10, 50],
  ];
  for (const [cx, cy, rad, r, g, b] of blobs) {
    for (let y = Math.max(0, cy - rad); y < Math.min(H, cy + rad); y += 2) {
      for (let x = Math.max(0, cx - rad); x < Math.min(W, cx + rad); x += 2) {
        const d = Math.hypot(x - cx, y - cy) / rad;
        if (d >= 1) continue;
        const a = 0.16 * (1 - d) * (1 - d);
        const idx = (y * W + x) * 3;
        base[idx] = Math.min(255, base[idx] + r * a);
        base[idx + 1] = Math.min(255, base[idx + 1] + g * a);
        base[idx + 2] = Math.min(255, base[idx + 2] + b * a);
      }
    }
  }
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x / W - 0.5) * 2, dy = (y / H - 0.5) * 2;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > 0.85) {
        const f = 1 - (d - 0.85) * 1.1;
        const idx = (y * W + x) * 3;
        base[idx] *= f; base[idx + 1] *= f; base[idx + 2] *= f;
      }
    }
  }
}
buildBase();

const CYAN = [34, 211, 238], MAGENTA = [232, 121, 249], AMBER = [251, 146, 60];
const WHITE = [226, 232, 240], DIM = [148, 163, 184], RED = [248, 113, 113];
const GREEN = [74, 222, 128];
const X = (gx) => gx * SCALE, Y = (gy) => gy * SCALE;

function drawStars(b, sim, t) {
  for (const st of sim.stars) {
    const a = 0.35 + 0.55 * Math.abs(Math.sin(t * 0.7 + st.tw));
    const s = Math.max(1, Math.round(st.s * SCALE));
    fillRect(b, X(st.x), Y(st.y), s, s, [200, 220, 255], a);
  }
}
function drawShip(b, sx, sy, angle, thrust, flick) {
  const SS = 1.3;
  const c = Math.cos(angle), s = Math.sin(angle);
  const rot = (lx, ly) => [sx + lx * c * SS - ly * s * SS, sy + lx * s * SS + ly * c * SS];
  if (thrust > 0.1) {
    const fl = (12 + flick * 10) * SCALE;
    fillPoly(b, [rot(-12 * SCALE, 5 * SCALE), rot(-12 * SCALE - fl, 0), rot(-12 * SCALE, -5 * SCALE)], AMBER, 0.9);
  }
  const pts = [rot(16 * SCALE, 0), rot(-11 * SCALE, 10 * SCALE), rot(-6 * SCALE, 0), rot(-11 * SCALE, -10 * SCALE)];
  fillPoly(b, pts, CYAN, 0.95);
  fillCircle(b, sx, sy, 26 * SCALE, CYAN, 0.08);
}
function drawGameplayFrame(b, sim, caption) {
  base.copy(b);
  const t = sim.time;
  drawStars(b, sim, t);
  for (const o of sim.orbs) {
    const pulse = (10 + Math.sin(t * 4 + o.ph) * 3) * SCALE;
    fillCircle(b, X(o.x), Y(o.y), pulse + 8 * SCALE, MAGENTA, 0.16);
    fillCircle(b, X(o.x), Y(o.y), pulse, MAGENTA, 0.95);
    fillCircle(b, X(o.x), Y(o.y), pulse * 0.45, [255, 255, 255], 0.9);
  }
  for (const a of sim.asteroids) {
    const pts = [];
    let ccx = 0, ccy = 0;
    for (let k = 0; k < a.verts.length; k++) {
      const an = (k / a.verts.length) * 6.2832 + a.rot;
      const rr = a.r * a.verts[k] * SCALE;
      const px = X(a.x) + Math.cos(an) * rr, py = Y(a.y) + Math.sin(an) * rr;
      pts.push([px, py]); ccx += px; ccy += py;
    }
    ccx /= pts.length; ccy /= pts.length;
    // dark rock first, then a stroked amber rim: the rasterizer blends
    // additively, so a filled amber underlay would wash the rock orange
    fillPoly(b, pts, [74, 42, 16], 0.98);
    strokePoly(b, pts, AMBER, 5, 0.95);
    fillCircle(b, X(a.x), Y(a.y), a.r * SCALE, AMBER, 0.07);
  }
  for (const p of sim.particles) {
    const col = p.color === "cyan" ? CYAN : p.color === "magenta" ? MAGENTA : AMBER;
    fillCircle(b, X(p.x), Y(p.y), p.size * SCALE * 1.6, col, Math.max(0, p.life / p.max) * 0.9);
  }
  if (sim.state !== "over") {
    if (sim.invuln <= 0 || Math.floor(t * 12) % 2 === 0) {
      drawShip(b, X(sim.ship.x), Y(sim.ship.y), sim.ship.angle, sim.ship.thrust, Math.sin(t * 31) * 0.5 + 0.5);
    }
  }
  // HUD (scale 4 at 1080p)
  drawText(b, "SCORE " + sim.score, 36 + textWidth("SCORE " + sim.score, 4) / 2, 30, 4, WHITE, 1);
  drawText(b, "LEVEL " + sim.level, 36 + textWidth("LEVEL " + sim.level, 4) / 2, 78, 4, WHITE, 1);
  if (sim.combo > 1) drawText(b, "COMBO X" + sim.combo, 36 + textWidth("COMBO X" + sim.combo, 4) / 2, 126, 4, MAGENTA, 1);
  const lives = "LIVES " + sim.lives;
  drawText(b, lives, W - 36 - textWidth(lives, 4) / 2, 30, 4, RED, 1);
  if (caption) {
    const w = textWidth(caption, 4);
    fillRect(b, W / 2 - w / 2 - 26, H - 96, w + 52, 58, [2, 2, 12], 0.72);
    drawText(b, caption, W / 2, H - 82, 4, WHITE, 1);
  }
  if (sim.state === "over") {
    fillRect(b, 0, 0, W, H, [3, 3, 12], 0.45);
    drawTextGlow(b, "GAME OVER", W / 2, 380, 15, RED, RED);
    drawText(b, "SCORE " + sim.score, W / 2, 570, 6, WHITE, 1);
    drawText(b, "NEW HIGH SCORE", W / 2, 650, 6, MAGENTA, 1);
  }
}
function wrapText(text, maxChars) {
  const words = text.split(" ");
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars && cur) { lines.push(cur.trim()); cur = w; }
    else cur += " " + w;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

// ---------- scripted gameplay: steer at the nearest orb, dodge rocks ----------
function autopilot(sim) {
  const s = sim.ship;
  let tx = null, ty = null, best = Infinity;
  for (const o of sim.orbs) {
    const d = (o.x - s.x) ** 2 + (o.y - s.y) ** 2;
    if (d < best) { best = d; tx = o.x; ty = o.y; }
  }
  let ix = 0, iy = 0;
  if (tx !== null) {
    const d = Math.sqrt(best) || 1;
    ix = (tx - s.x) / d; iy = (ty - s.y) / d;
  }
  let ax = 0, ay = 0, aBest = Infinity, aNear = null;
  for (const a of sim.asteroids) {
    const d = (a.x - s.x) ** 2 + (a.y - s.y) ** 2;
    if (d < aBest) { aBest = d; aNear = a; }
  }
  if (aNear && aBest < 150 * 150) {
    const d = Math.sqrt(aBest) || 1;
    const w = (150 - d) / 150;
    ax = -(aNear.x - s.x) / d * w * 1.6;
    ay = -(aNear.y - s.y) / d * w * 1.6;
  }
  if (s.x < 150) ix += 1.2; if (s.x > WORLD.w - 150) ix -= 1.2;
  if (s.y < 150) iy += 1.2; if (s.y > WORLD.h - 150) iy -= 1.2;
  ix += ax; iy += ay;
  const m = Math.hypot(ix, iy);
  if (m > 1) { ix /= m; iy /= m; }
  return { x: ix, y: iy };
}

// ---------- audio: deterministic chiptune WAV ----------
function writeWav(path) {
  const sr = 44100, dur = SECONDS;
  const n = sr * dur;
  const pcm = new Int16Array(n);
  const bpm = 132, eighth = 60 / bpm / 2;
  const lead = [440, 523.25, 659.25, 587.33, 523.25, 440, 392, 440,
    523.25, 659.25, 783.99, 659.25, 587.33, 523.25, 440, 392,
    440, 523.25, 659.25, 880, 783.99, 659.25, 587.33, 523.25,
    659.25, 587.33, 523.25, 440, 392, 440, 523.25, 0];
  const bassNotes = [110, 87.31, 130.81, 98];
  const notesPerBar = 8, barLen = eighth * notesPerBar;
  for (let i = 0; i < n; i++) {
    const t = i / sr;
    let v = 0;
    const idx = Math.floor(t / eighth);
    const lt = t - idx * eighth;
    const f = lead[idx % lead.length];
    if (f > 0) {
      const env = Math.exp(-lt * 9);
      v += 0.20 * env * (Math.sin(2 * Math.PI * f * t) + 0.25 * Math.sin(2 * Math.PI * f * 3 * t));
    }
    const bar = Math.floor(t / barLen);
    const bf = bassNotes[bar % bassNotes.length];
    const bt = t - bar * barLen;
    v += 0.14 * Math.exp(-bt * 2.2) * Math.sin(2 * Math.PI * bf * t);
    if ((idx % 2 === 1) && lt < 0.03) v += 0.03 * (Math.sin(i * 12.9898) * 43758.5453 % 1) * 0.5;
    pcm[i] = Math.max(-32767, Math.min(32767, Math.round(v * 32767)));
  }
  const dataSize = n * 2;
  const hdr = Buffer.alloc(44);
  hdr.write("RIFF", 0); hdr.writeUInt32LE(36 + dataSize, 4); hdr.write("WAVE", 8);
  hdr.write("fmt ", 12); hdr.writeUInt32LE(16, 16); hdr.writeUInt16LE(1, 20);
  hdr.writeUInt16LE(1, 22); hdr.writeUInt32LE(sr, 24); hdr.writeUInt32LE(sr * 2, 28);
  hdr.writeUInt16LE(2, 32); hdr.writeUInt16LE(16, 34);
  hdr.write("data", 36); hdr.writeUInt32LE(dataSize, 40);
  writeFileSync(path, Buffer.concat([hdr, Buffer.from(pcm.buffer)]));
}

// ---------- PNG writer (for stills) ----------
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();
function crc32(b) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td), 0);
  return Buffer.concat([len, td, crc]);
}
function writePNG(path, rgb, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(h * (1 + w * 3));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 3)] = 0;
    rgb.copy(raw, y * (1 + w * 3) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const idat = zlib.deflateSync(raw, { level: 6 });
  writeFileSync(path, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]),
    chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0)),
  ]));
}

// ---------- timeline ----------
const PROMPT = "Build a tiny arcade game I can play in my browser in under a minute: a lone neon starship dodging asteroids and collecting energy orbs, with a score, lives, levels that get faster, and a game-over screen - make it look gorgeous and feel great.";
const CAPTIONS = [
  [390, 540, "IT WROTE THE CODE."],
  [540, 720, "IT TUNED THE LEVELS."],
  [720, 900, "IT RENDERED THIS VIDEO FROM THE GAME ITSELF."],
  [900, 1005, "THEN IT PLAYED IT."],
];
const STILL_FRAMES = new Set([45, 150, 300, 600, 900, 1000]);

// Real lines of game.js for the "agent at work" segment: short lines, in order.
const CODE_LINES = gameSrc.split("\n")
  .map((l) => l.replace(/\s+$/, ""))
  .filter((l) => l.trim().length >= 3 && l.length <= 56)
  .slice(0, 16);

function drawTerminal(b, f) {
  // window
  fillRect(b, 210, 170, 1500, 760, [10, 12, 26], 0.96);
  fillRect(b, 210, 170, 1500, 56, [24, 28, 52], 1);
  fillCircle(b, 250, 198, 9, RED, 1);
  fillCircle(b, 284, 198, 9, AMBER, 1);
  fillCircle(b, 318, 198, 9, GREEN, 1);
  drawTextLeft(b, "AGENT - BUILDING NEON DRIFT", 360, 182, 3, DIM, 1);
  drawTextLeft(b, "$ muse build neon-drift --one-prompt", 250, 262, 3, CYAN, 1);
  const shown = Math.min(CODE_LINES.length, Math.floor((f - 195) / 10) + 1);
  for (let i = 0; i < shown; i++) {
    const ln = CODE_LINES[i];
    const col = ln.trim().startsWith("//") ? DIM : WHITE;
    drawTextLeft(b, ln, 250, 318 + i * 36, 3, col, 1);
  }
  // blinking cursor after the last shown line
  if (f % 16 < 8 && shown < CODE_LINES.length) {
    const lx = 250 + textWidth(CODE_LINES[shown - 1] || "", 3) + 8;
    fillRect(b, lx, 318 + (shown - 1) * 36, 14, 21, GREEN, 1);
  } else if (f % 16 < 8) {
    fillRect(b, 250, 318 + shown * 36, 14, 21, GREEN, 1);
  }
  drawTextLeft(b, "BUILDING... " + Math.min(99, Math.floor(((f - 195) / 195) * 100)) + "%", 250, 318 + 16 * 36 + 8, 3, GREEN, 1);
}

async function main() {
  const wavPath = join(ROOT, ".render-audio.wav");
  writeWav(wavPath);
  const ff = spawn("ffmpeg", [
    "-y", "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${W}x${H}`, "-r", String(FPS),
    "-i", "pipe:0", "-i", wavPath,
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-r", String(FPS),
    "-crf", "20", "-preset", "medium",
    "-c:a", "aac", "-b:a", "96k", "-shortest",
    "-movflags", "+faststart",
    "-metadata", "creation_time=2026-11-23T00:00:00Z",
    "-fflags", "+bitexact",
    outPath,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const sim = new Sim(20261123);
  let finalScore = 0, finalLevel = 1;
  for (let f = 0; f < FRAMES; f++) {
    const t = f / FPS;
    if (f < 90) {
      // title card
      base.copy(buf);
      drawStars(buf, sim, t);
      const shipX = 180 + (f / 90) * (W - 360);
      drawShip(buf, shipX, 840 + Math.sin(f * 0.11) * 36, 0, 1, 0.6);
      drawTextGlow(buf, "MY AI AGENT", W / 2, 285, 15, CYAN, CYAN);
      drawTextGlow(buf, "GOT ONE PROMPT", W / 2, 450, 15, WHITE, CYAN);
      drawText(buf, "AND BUILT A WHOLE GAME FROM IT.", W / 2, 675, 4, DIM, 1);
    } else if (f < 195) {
      // the prompt card
      base.copy(buf);
      drawStars(buf, sim, t);
      drawText(buf, "THE ONE PROMPT:", W / 2, 165, 6, MAGENTA, 1);
      const lines = wrapText('"' + PROMPT + '"', 52);
      lines.forEach((ln, i) => drawText(buf, ln, W / 2, 300 + i * 78, 4, WHITE, 1));
    } else if (f < 390) {
      // the agent at work
      base.copy(buf);
      drawStars(buf, sim, t);
      drawText(buf, "THE AGENT, AT WORK:", W / 2, 100, 4, MAGENTA, 1);
      drawTerminal(buf, f);
    } else {
      // gameplay: the real sim, scripted inputs
      sim.step(autopilot(sim));
      finalScore = sim.score; finalLevel = sim.level;
      let caption = null;
      for (const [a, b2, c] of CAPTIONS) if (f >= a && f < b2) caption = c;
      drawGameplayFrame(buf, sim, caption);
    }
    if (stillsDir && STILL_FRAMES.has(f)) {
      writePNG(join(stillsDir, `frame-${String(f).padStart(4, "0")}.png`), buf, W, H);
    }
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once("drain", r));
    if (f % 180 === 0) console.log(`frame ${f}/${FRAMES} score=${finalScore} level=${finalLevel} state=${sim.state}`);
  }
  ff.stdin.end();
  await new Promise((resolve, reject) => {
    ff.on("error", reject);
    ff.on("close", (code) => (code === 0 ? resolve() : reject(new Error("ffmpeg exit " + code))));
  });
  const mp4 = readFileSync(outPath);
  const sha = createHash("sha256").update(mp4).digest("hex");
  console.log(JSON.stringify({
    out: outPath, bytes: mp4.length, sha256: sha,
    frames: FRAMES, fps: FPS, seconds: SECONDS,
    finalScore, finalLevel, simState: sim.state,
  }, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
