// NEON DRIFT — entrypoint for make.fun's "The agent builds a game from
// one prompt" bounty (Node 22, standard library only).
//
// The entry is the X post itself: this program copies POST.json from the
// repository root to /output/POST.json, where the gate reads it. That is
// all it writes to /output. It also validates the post address and prints
// one deterministic summary line (post, video, game) to stdout, so a run
// can be checked without opening the files. It uses no network, no wall
// clock and no file outside the repository, and two runs write the same
// bytes: the copy is byte for byte and the summary is computed from the
// repository's own files.
//
// Local run (the way the grader runs it):
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts

import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
const HERE = dirname(fileURLToPath(import.meta.url));

const POST_URL = /^https:\/\/(www\.|mobile\.)?(x\.com|twitter\.com)\/[^/]+\/status\/\d+$/;
const POST_URL_ALT = /^https:\/\/(www\.|mobile\.)?(x\.com|twitter\.com)\/i\/web\/status\/\d+$/;
const PLACEHOLDER = 'https://x.com/<handle>/status/<id>';

function sha256(path: string): string {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

mkdirSync(OUTPUT_DIR, { recursive: true });

const postSrc = join(BOT_DIR, 'POST.json');
const postDst = join(OUTPUT_DIR, 'POST.json');
try {
  copyFileSync(postSrc, postDst);
} catch (err) {
  console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
  process.exit(1);
}

let url = '';
let status = 'unreadable';
try {
  const parsed = JSON.parse(readFileSync(postDst, 'utf8')) as { url?: unknown };
  if (typeof parsed.url === 'string') {
    url = parsed.url;
    if (url === PLACEHOLDER) status = 'placeholder';
    else if (POST_URL.test(url) || POST_URL_ALT.test(url)) status = 'live';
    else status = 'unrecognised';
  }
} catch {
  status = 'unreadable';
}
if (status === 'placeholder') {
  console.error('POST.json still holds the starter placeholder: replace it with the posted address before submitting.');
} else if (status !== 'live') {
  console.error(`POST.json url does not look like an X post address: ${url}`);
}

const gameFiles = ['game/index.html', 'game/game.js'];
const gamePresent = gameFiles.every((f) => existsSync(join(HERE, f)));
const videoPath = join(HERE, 'video.mp4');
const video = existsSync(videoPath)
  ? { file: 'video.mp4', bytes: statSync(videoPath).size, sha256: sha256(videoPath) }
  : null;
if (video === null) console.error('video.mp4 is not in the repository root.');

console.log(JSON.stringify({
  post: { url, status },
  video,
  game: { files: gameFiles, present: gamePresent },
}));
