// NEON DRIFT — a tiny arcade game built from one prompt.
// Classic script (no modules, no dependencies): <script src="game.js">
// exposes window.NeonDrift = { Sim, mulberry32, WORLD }.
// The simulation is pure logic with a seeded RNG, so the same seed +
// the same inputs replay the exact same game — the video renderer in
// ../render-video.mjs runs this very file headless to film real play.
(function (global) {
  "use strict";

  var WORLD = { w: 960, h: 540 };

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function dist2(ax, ay, bx, by) {
    var dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  // One prompt. One game. This is the whole design:
  // "a lone neon starship dodging asteroids and collecting energy orbs,
  //  with a score, lives, levels that get faster, and a game-over screen."
  function Sim(seed) {
    this.rng = mulberry32(seed == null ? 1337 : seed);
    this.tick = 0;
    this.time = 0;
    this.score = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.orbsCollected = 0;
    this.level = 1;
    this.lives = 3;
    this.state = "playing"; // playing | over
    this.invuln = 0;
    this.events = []; // events fired on the last step
    this.ship = { x: WORLD.w / 2, y: WORLD.h / 2 + 80, vx: 0, vy: 0, angle: -Math.PI / 2, thrust: 0 };
    this.asteroids = [];
    this.orbs = [];
    this.particles = [];
    this.stars = [];
    var i, r = this.rng;
    for (i = 0; i < 90; i++) {
      this.stars.push({ x: r() * WORLD.w, y: r() * WORLD.h, s: 0.4 + r() * 1.6, tw: r() * 6.28 });
    }
    for (i = 0; i < 6; i++) this.spawnAsteroid(true);
    for (i = 0; i < 6; i++) this.spawnOrb();
  }

  Sim.prototype.spawnAsteroid = function (anywhere) {
    var r = this.rng, a;
    var edge = Math.floor(r() * 4), x, y;
    if (anywhere) { x = r() * WORLD.w; y = r() * WORLD.h; }
    else if (edge === 0) { x = r() * WORLD.w; y = -30; }
    else if (edge === 1) { x = WORLD.w + 30; y = r() * WORLD.h; }
    else if (edge === 2) { x = r() * WORLD.w; y = WORLD.h + 30; }
    else { x = -30; y = r() * WORLD.h; }
    if (dist2(x, y, this.ship.x, this.ship.y) < 180 * 180) { x = (x + 420) % WORLD.w; y = (y + 260) % WORLD.h; }
    var verts = [], n = 8 + Math.floor(r() * 3), k;
    for (k = 0; k < n; k++) verts.push(0.72 + r() * 0.5);
    a = {
      x: x, y: y,
      vx: (r() - 0.5) * 2 * (46 + this.level * 7),
      vy: (r() - 0.5) * 2 * (46 + this.level * 7),
      r: 15 + r() * 19, rot: r() * 6.28, vr: (r() - 0.5) * 1.6,
      verts: verts, hue: 28 + r() * 14
    };
    this.asteroids.push(a);
  };

  Sim.prototype.spawnOrb = function () {
    var r = this.rng, x, y, tries = 0;
    do {
      x = 40 + r() * (WORLD.w - 80);
      y = 40 + r() * (WORLD.h - 80);
      tries++;
    } while (tries < 20 && dist2(x, y, this.ship.x, this.ship.y) < 120 * 120);
    this.orbs.push({ x: x, y: y, ph: r() * 6.28, taken: false });
  };

  Sim.prototype.burst = function (x, y, color, n, speed) {
    var r = this.rng, i, a;
    for (i = 0; i < n; i++) {
      a = r() * 6.28;
      this.particles.push({
        x: x, y: y,
        vx: Math.cos(a) * speed * (0.3 + r() * 0.9),
        vy: Math.sin(a) * speed * (0.3 + r() * 0.9),
        life: 0.5 + r() * 0.5, max: 1, color: color, size: 1.5 + r() * 2.5
      });
    }
  };

  // input: {x: -1..1, y: -1..1} thrust vector. Fixed dt = 1/60.
  Sim.prototype.step = function (input) {
    var dt = 1 / 60, s = this.ship, i, a, o, d2;
    this.events = [];
    if (this.state === "over") { this.tick++; this.time += dt; return; }
    this.tick++;
    this.time += dt;

    // --- ship ---
    var ix = input ? (input.x || 0) : 0, iy = input ? (input.y || 0) : 0;
    var mag = Math.sqrt(ix * ix + iy * iy);
    if (mag > 1) { ix /= mag; iy /= mag; }
    s.thrust = mag;
    s.vx += ix * 430 * dt; s.vy += iy * 430 * dt;
    s.vx *= (1 - 0.55 * dt); s.vy *= (1 - 0.55 * dt);
    var sp = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (sp > 340) { s.vx *= 340 / sp; s.vy *= 340 / sp; }
    s.x += s.vx * dt; s.y += s.vy * dt;
    if (s.x < 14) { s.x = 14; s.vx = Math.abs(s.vx) * 0.5; }
    if (s.x > WORLD.w - 14) { s.x = WORLD.w - 14; s.vx = -Math.abs(s.vx) * 0.5; }
    if (s.y < 14) { s.y = 14; s.vy = Math.abs(s.vy) * 0.5; }
    if (s.y > WORLD.h - 14) { s.y = WORLD.h - 14; s.vy = -Math.abs(s.vy) * 0.5; }
    if (sp > 24) s.angle = Math.atan2(s.vy, s.vx);
    if (mag > 0.1 && this.rng() < 0.85) {
      this.particles.push({
        x: s.x - Math.cos(s.angle) * 14, y: s.y - Math.sin(s.angle) * 14,
        vx: -Math.cos(s.angle) * 60 + (this.rng() - 0.5) * 40,
        vy: -Math.sin(s.angle) * 60 + (this.rng() - 0.5) * 40,
        life: 0.35, max: 0.35, color: "cyan", size: 2
      });
    }
    if (this.invuln > 0) this.invuln -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // --- asteroids ---
    for (i = 0; i < this.asteroids.length; i++) {
      a = this.asteroids[i];
      a.x += a.vx * dt; a.y += a.vy * dt; a.rot += a.vr * dt;
      if (a.x < -50) a.x = WORLD.w + 44; if (a.x > WORLD.w + 50) a.x = -44;
      if (a.y < -50) a.y = WORLD.h + 44; if (a.y > WORLD.h + 50) a.y = -44;
      if (this.invuln <= 0) {
        d2 = dist2(a.x, a.y, s.x, s.y);
        var rr = a.r * 0.82 + 11;
        if (d2 < rr * rr) {
          this.lives--;
          this.combo = 0; this.comboTimer = 0;
          this.invuln = 2;
          this.burst(s.x, s.y, "orange", 26, 190);
          this.burst(a.x, a.y, "orange", 14, 130);
          this.events.push({ type: "hit", lives: this.lives });
          if (this.lives <= 0) {
            this.state = "over";
            this.burst(s.x, s.y, "cyan", 60, 260);
            this.events.push({ type: "gameover", score: this.score });
          }
          break;
        }
      }
    }

    // --- orbs ---
    for (i = this.orbs.length - 1; i >= 0; i--) {
      o = this.orbs[i];
      d2 = dist2(o.x, o.y, s.x, s.y);
      if (d2 < 110 * 110) { // magnet
        var d = Math.sqrt(d2) || 1;
        o.x += (s.x - o.x) / d * 130 * dt;
        o.y += (s.y - o.y) / d * 130 * dt;
      }
      if (d2 < 24 * 24) {
        this.orbs.splice(i, 1);
        this.combo++;
        this.comboTimer = 3;
        var gained = 100 * this.combo;
        this.score += gained;
        this.orbsCollected++;
        this.burst(o.x, o.y, "magenta", 16, 150);
        this.events.push({ type: "collect", score: this.score, combo: this.combo, gained: gained });
        this.spawnOrb();
        var newLevel = 1 + Math.floor(this.orbsCollected / 8);
        if (newLevel > this.level) {
          this.level = newLevel;
          this.spawnAsteroid(false);
          this.events.push({ type: "levelup", level: this.level });
        }
      }
    }

    // --- particles ---
    for (i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= (1 - 1.4 * dt); p.vy *= (1 - 1.4 * dt);
    }
  };

  // ---------- browser shell: rendering, input, sound ----------
  function startBrowserGame(canvas) {
    var ctx = canvas.getContext("2d");
    var W = WORLD.w, H = WORLD.h;
    var sim = new Sim(20261123);
    var keys = {};
    var best = 0;
    try { best = parseInt(localStorage.getItem("neon-drift-best") || "0", 10) || 0; } catch (e) { best = 0; }
    var audio = null;
    function beep(freq, dur, type, vol) {
      if (!audio) return;
      try {
        var o = audio.createOscillator(), g = audio.createGain();
        o.type = type || "square"; o.frequency.value = freq;
        g.gain.setValueAtTime(vol || 0.05, audio.currentTime);
        g.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + dur);
        o.connect(g); g.connect(audio.destination);
        o.start(); o.stop(audio.currentTime + dur);
      } catch (e) { /* audio is best-effort */ }
    }
    function unlockAudio() {
      if (!audio) {
        try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
      }
      if (audio && audio.state === "suspended") audio.resume();
    }
    function readInput() {
      var x = 0, y = 0;
      if (keys.ArrowLeft || keys.KeyA) x -= 1;
      if (keys.ArrowRight || keys.KeyD) x += 1;
      if (keys.ArrowUp || keys.KeyW) y -= 1;
      if (keys.ArrowDown || keys.KeyS) y += 1;
      if (touch.active) {
        var dx = touch.x - sim.ship.x, dy = touch.y - sim.ship.y;
        var m = Math.sqrt(dx * dx + dy * dy);
        if (m > 18) { x = dx / m; y = dy / m; }
      }
      return { x: x, y: y };
    }
    var touch = { active: false, x: 0, y: 0 };
    function canvasPos(e) {
      var r = canvas.getBoundingClientRect();
      var cx = (e.touches ? e.touches[0].clientX : e.clientX);
      var cy = (e.touches ? e.touches[0].clientY : e.clientY);
      return { x: (cx - r.left) * (W / r.width), y: (cy - r.top) * (H / r.height) };
    }
    window.addEventListener("keydown", function (e) {
      keys[e.code] = true;
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) >= 0) e.preventDefault();
      unlockAudio();
      if (e.code === "KeyR" && sim.state === "over") restart();
      if (e.code === "KeyM") audio = null;
    });
    window.addEventListener("keyup", function (e) { keys[e.code] = false; });
    canvas.addEventListener("pointerdown", function (e) {
      unlockAudio();
      var p = canvasPos(e); touch.active = true; touch.x = p.x; touch.y = p.y;
      if (sim.state === "over") restart();
    });
    canvas.addEventListener("pointermove", function (e) {
      if (!touch.active) return;
      var p = canvasPos(e); touch.x = p.x; touch.y = p.y;
    });
    window.addEventListener("pointerup", function () { touch.active = false; });
    function restart() {
      var keepBest = Math.max(best, sim.score);
      best = keepBest;
      try { localStorage.setItem("neon-drift-best", String(best)); } catch (e) { /* ignore */ }
      sim = new Sim(20261123 + Math.floor(Math.random() * 100000));
    }
    function drawShip(s) {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(s.angle);
      if (s.thrust > 0.1) {
        var fl = 12 + Math.random() * 10;
        ctx.beginPath();
        ctx.moveTo(-12, 5); ctx.lineTo(-12 - fl, 0); ctx.lineTo(-12, -5);
        ctx.closePath();
        ctx.fillStyle = "rgba(255,170,40,0.9)"; ctx.fill();
      }
      ctx.beginPath();
      ctx.moveTo(16, 0); ctx.lineTo(-11, 10); ctx.lineTo(-6, 0); ctx.lineTo(-11, -10);
      ctx.closePath();
      ctx.fillStyle = "#22d3ee";
      ctx.shadowColor = "#22d3ee"; ctx.shadowBlur = 14;
      ctx.fill();
      ctx.restore();
    }
    function draw() {
      ctx.fillStyle = "#050510";
      ctx.fillRect(0, 0, W, H);
      var t = sim.time, i;
      for (i = 0; i < sim.stars.length; i++) {
        var st = sim.stars[i];
        var a = 0.35 + 0.55 * Math.abs(Math.sin(t * 0.7 + st.tw));
        ctx.fillStyle = "rgba(200,220,255," + a.toFixed(2) + ")";
        ctx.fillRect(st.x, st.y, st.s, st.s);
      }
      for (i = 0; i < sim.orbs.length; i++) {
        var o = sim.orbs[i];
        var pulse = 7 + Math.sin(t * 4 + o.ph) * 2;
        ctx.beginPath(); ctx.arc(o.x, o.y, pulse + 6, 0, 6.2832);
        ctx.fillStyle = "rgba(232,121,249,0.18)"; ctx.fill();
        ctx.beginPath(); ctx.arc(o.x, o.y, pulse, 0, 6.2832);
        ctx.fillStyle = "#e879f9";
        ctx.shadowColor = "#e879f9"; ctx.shadowBlur = 16; ctx.fill();
        ctx.shadowBlur = 0;
      }
      for (i = 0; i < sim.asteroids.length; i++) {
        var as = sim.asteroids[i];
        ctx.save();
        ctx.translate(as.x, as.y); ctx.rotate(as.rot);
        ctx.beginPath();
        for (var k = 0; k < as.verts.length; k++) {
          var an = (k / as.verts.length) * 6.2832;
          var rr = as.r * as.verts[k];
          if (k === 0) ctx.moveTo(Math.cos(an) * rr, Math.sin(an) * rr);
          else ctx.lineTo(Math.cos(an) * rr, Math.sin(an) * rr);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(60,32,10,0.95)";
        ctx.fill();
        ctx.strokeStyle = "hsl(" + as.hue + ",90%,58%)";
        ctx.lineWidth = 2;
        ctx.shadowColor = "hsl(" + as.hue + ",90%,58%)"; ctx.shadowBlur = 8;
        ctx.stroke();
        ctx.restore();
      }
      for (i = 0; i < sim.particles.length; i++) {
        var p = sim.particles[i];
        ctx.globalAlpha = Math.max(0, p.life / p.max);
        ctx.fillStyle = p.color === "cyan" ? "#22d3ee" : p.color === "magenta" ? "#e879f9" : "#fb923c";
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, 6.2832); ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (sim.state !== "over") {
        if (sim.invuln <= 0 || Math.floor(t * 12) % 2 === 0) drawShip(sim.ship);
      }
      // HUD
      ctx.fillStyle = "#e2e8f0";
      ctx.font = "bold 22px system-ui, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("SCORE " + sim.score, 16, 32);
      ctx.fillText("LEVEL " + sim.level, 16, 60);
      if (sim.combo > 1) {
        ctx.fillStyle = "#e879f9";
        ctx.fillText("COMBO x" + sim.combo, 16, 88);
      }
      ctx.textAlign = "right";
      ctx.fillStyle = "#94a3b8";
      ctx.fillText("BEST " + Math.max(best, sim.score), W - 16, 32);
      ctx.fillStyle = "#f87171";
      var hearts = "";
      for (i = 0; i < sim.lives; i++) hearts += "♥ ";
      ctx.font = "20px system-ui, sans-serif";
      ctx.fillText(hearts, W - 16, 60);
      ctx.textAlign = "center";
      if (sim.state === "over") {
        ctx.fillStyle = "rgba(5,5,16,0.72)";
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = "#f87171";
        ctx.font = "bold 54px system-ui, sans-serif";
        ctx.fillText("GAME OVER", W / 2, H / 2 - 30);
        ctx.fillStyle = "#e2e8f0";
        ctx.font = "28px system-ui, sans-serif";
        ctx.fillText("SCORE " + sim.score + "   ·   BEST " + Math.max(best, sim.score), W / 2, H / 2 + 16);
        ctx.fillStyle = "#94a3b8";
        ctx.font = "20px system-ui, sans-serif";
        ctx.fillText("Press R or tap to fly again", W / 2, H / 2 + 52);
      } else if (sim.tick < 90) {
        ctx.fillStyle = "rgba(226,232,240,0.9)";
        ctx.font = "20px system-ui, sans-serif";
        ctx.fillText("Arrows / WASD to fly — grab the pink orbs, dodge the rocks", W / 2, H - 24);
      }
    }
    var lastEvents = 0;
    function frame() {
      sim.step(readInput());
      for (var i = 0; i < sim.events.length; i++) {
        var ev = sim.events[i];
        if (ev.type === "collect") beep(520 + ev.combo * 60, 0.09, "sine", 0.05);
        else if (ev.type === "hit") beep(140, 0.25, "sawtooth", 0.07);
        else if (ev.type === "levelup") { beep(660, 0.1, "square", 0.05); setTimeout(function () { beep(880, 0.14, "square", 0.05); }, 110); }
        else if (ev.type === "gameover") beep(90, 0.6, "sawtooth", 0.08);
      }
      draw();
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return { sim: sim };
  }

  global.NeonDrift = { Sim: Sim, mulberry32: mulberry32, WORLD: WORLD, startBrowserGame: startBrowserGame };
})(typeof window !== "undefined" ? window : globalThis);
