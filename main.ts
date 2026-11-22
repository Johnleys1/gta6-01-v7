// Aurora Falls — the entry program (Node 22, standard library only).
// It hands the game in: copies game/ and screenshots/ from beside this file
// into the output directory and writes dossier.json with the kit's vendored
// buildDossier library, so the judge can read the game from the dossier.
//
// CRITICAL: the output directory itself must NEVER be deleted. The grader
// mounts it as a bind mount, and removing the mount point fails the run.
// So the program first creates the output directory (mkdir, recursive),
// then deletes ONLY the game/ and screenshots/ folders INSIDE it, then
// copies the game and screenshots in. Run it outside the grader with
// MAKEFUN_OUTPUT_DIR set:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
// Both runs must write byte-identical output.

import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// Create the output directory first. Never remove it: the grader bind-mounts
// it, and deleting the mount point breaks the run (v6 failed exactly here).
mkdirSync(out, { recursive: true });
// Clear only the destination trees inside it: a stale file left in /output
// from an earlier run would otherwise survive into the dossier and break
// the byte-identical guarantee between runs.
rmSync(join(out, 'game'), { recursive: true, force: true });
rmSync(join(out, 'screenshots'), { recursive: true, force: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Caps mirror the scorer's gate so a build that passes here passes there:
// 4 screenshots at most, 256 KiB each; game/ at most 993 files and 48 MiB;
// every game path at most 1000 bytes; dossier text at most 160 KiB.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);

console.log(`Aurora Falls: wrote ${join(out, 'dossier.json')}`);
