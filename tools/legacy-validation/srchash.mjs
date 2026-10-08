// 소스 지문(검증 때와 같은 방식: node_modules·.next·.next-test·data·.git, tsbuildinfo·next-env.d.ts 제외)
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
const P = process.argv[2];
const skip = new Set(["node_modules", ".next", ".next-test", "data", ".git"]);
const walk = (d) => readdirSync(d).sort().flatMap((f) => { if (skip.has(f)) return []; const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : [p]; });
const hs = createHash("sha256"); let n = 0;
for (const f of walk(P)) { if (f.endsWith(".tsbuildinfo") || f.endsWith("next-env.d.ts")) continue; hs.update(relative(P, f) + "\0").update(readFileSync(f)); n++; }
console.log(JSON.stringify({ source: hs.digest("hex").slice(0, 16), files: n }));
