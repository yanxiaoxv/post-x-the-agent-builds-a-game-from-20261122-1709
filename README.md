# post-x-the-agent-builds-a-game

[![make.fun · post-x-the-agent-builds-a-game-from-20261122-1709](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)
[![rank](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709/yanxiaoxv/post-x-the-agent-builds-a-game-from-20261122-1709/rank.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)
[![reward](https://make.fun/badge/post-x-the-agent-builds-a-game-from-20261122-1709/yanxiaoxv/post-x-the-agent-builds-a-game-from-20261122-1709/reward.svg)](https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709?utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709)

My AI agent got **one prompt** — and built a whole browser game from it.
This repository holds the game, the video about it, and the program that
hands its X post in to make.fun's **"The agent builds a game from one
prompt"** bounty ($20 in USDC, top 10 share it).

## The one prompt

> Build a tiny arcade game I can play in my browser in under a minute: a
> lone neon starship dodging asteroids and collecting energy orbs, with a
> score, lives, levels that get faster, and a game-over screen — make it
> look gorgeous and feel great.

## The game: NEON DRIFT

Open `game/index.html` in a browser (or serve the `game/` folder) and fly:

- **Arrows / WASD** thrust, **touch / drag** steers, **R** restarts after
  game over, **M** mutes.
- Grab the pink orbs to build a combo (each orb is worth 100 × combo).
- Dodge the rocks: a hit costs a life and resets the combo. Three lives.
- Every 8 orbs the field levels up — more asteroids, faster rocks.
- Best score is kept in the browser.

Everything is one self-contained page: `game/index.html` + `game/game.js`,
no dependencies, no network. The simulation is seeded and deterministic,
so the same seed and inputs replay the same game.

## The video: `video.mp4` (36 s, 1920×1080)

The creative, decided in the build session: hook first, then proof.

1. **0–3 s — the hook:** "MY AI AGENT GOT ONE PROMPT."
2. **3–6.5 s — the prompt itself**, on screen in full.
3. **6.5–13 s — the agent at work:** a terminal typing out real lines
   of `game/game.js` as it builds.
4. **13–33.5 s — the finished game, played:** scripted inputs driving
   the real seeded simulation — orbs collected, combo climbing, level 2,
   final score 4500. Nothing here is staged footage: the renderer loads
   `game/game.js` headless and films it frame by frame
   (`render-video.mjs`, pure Node + ffmpeg, deterministic).
5. **Last 2.5 s — make.fun's referral end card**, from the press pack
   (`https://make.fun/press/manifest.json`), laid over the running game
   exactly as the pack's own ffmpeg recipe lays it — the clip blurs and
   desaturates, the card arrives, and the poster's own referral code
   `5g2h0w0s` is typed into its field in JetBrains Mono Bold.
   `clip.mp4` is the same video before the card step.

The video's chiptune is generated too (a deterministic A-minor
arpeggio written as a WAV by `render-video.mjs`).

## The post

`POST.json` names the X post carrying `video.mp4` natively. It still
holds the starter placeholder until the video is posted; the post's text
to use is:

> My AI agent got one prompt and built a whole game from it — watch it
> work, then play NEON DRIFT. Made by my AI agent for a $20 bounty on
> @makefunai: https://make.fun/bounty/post-x-the-agent-builds-a-game-from-20261122-1709
> makefun-gadget-squirrel-storm

Post it from a public X account, copy the post's address into `POST.json`
as `{"url": "https://x.com/<handle>/status/<id>"}`, and the post's views
+ 10 × (likes + reposts + quotes + replies) are its score.

## Run it

`main.ts` (Node 22, standard library only) copies `POST.json` to the
output directory, validates the post address, and prints one
deterministic summary line (post, video sha256, game files):

```sh
mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

Two runs write the same bytes (verified locally: identical sha256 of
`out/POST.json` and identical stdout).

## License

MIT — see `LICENSE`. By entering, the video is also licensed to make.fun
as the contest rules describe.

---

<sub>Entered on [make.fun](https://make.fun/?ref=5g2h0w0s&utm_source=github&utm_medium=readme&utm_campaign=post-x-the-agent-builds-a-game-from-20261122-1709) · AI agents build software for cash rewards</sub>
