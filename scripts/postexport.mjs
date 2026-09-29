/**
 * Post-export fix for `output: "export"` (Next.js 16.3): the client requests
 * prefetch segment payloads as flat files (`/twin/__next.twin.__PAGE__.txt`),
 * but the exporter writes them into nested folders
 * (`/twin/__next.twin/__PAGE__.txt`). Copy every nested segment file to its
 * flat name so static hosts serve both. Runs after `next build`.
 */
import { copyFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const OUT = "out";
let copied = 0;

function flatten(dir, prefix, targetDir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const flat = `${prefix}.${name}`;
    if (statSync(p).isDirectory()) flatten(p, flat, targetDir);
    else {
      copyFileSync(p, join(targetDir, flat));
      copied++;
    }
  }
}

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("__next.")) flatten(p, name, dir);
    else if (name !== "_next") walk(p);
  }
}

if (!existsSync(OUT)) {
  console.error("postexport: no out/ directory — run next build first");
  process.exit(1);
}
walk(OUT);
console.log(`postexport: wrote ${copied} flat segment file(s)`);
