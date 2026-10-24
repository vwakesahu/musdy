// fails on any comment longer than one line, the repo rule
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["contracts/src", "contracts/test", "contracts/script", "shared", "server/src", "server/test", "web/src", "web/e2e"];
const skip = /node_modules|\/abi\/|\.next|contracts\/lib/;
const bad = [];

const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (skip.test(p)) continue;
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx|mjs|sol)$/.test(name)) check(p);
  }
};

const check = (file) => {
  const lines = readFileSync(file, "utf8").split("\n");
  let run = 0;
  lines.forEach((line, i) => {
    const t = line.trim();
    const isComment = /^(\/\/|\/\*|\*|\{\/\*)/.test(t) && !t.startsWith("// SPDX");
    const opensBlock = /\/\*(?!.*\*\/)/.test(t);
    if (opensBlock) bad.push(`${file}:${i + 1} block comment spans lines`);
    run = isComment ? run + 1 : 0;
    if (run === 2) bad.push(`${file}:${i} comment longer than one line`);
  });
};

for (const r of roots) walk(r);
if (bad.length) {
  console.error(bad.join("\n"));
  process.exit(1);
}
