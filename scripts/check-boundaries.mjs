// Chạy trong `pnpm lint`. Thoát mã 1 nếu có import vi phạm ranh giới module.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { findViolations } from './lib/boundaries.mjs';

const ROOTS = ['apps', 'packages'];
const SKIP = new Set(['node_modules', '.next', '.turbo', 'dist', 'coverage']);

function walk(dir, out) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (SKIP.has(name)) continue;
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|mts)$/.test(name)) out.push(full);
  }
}

const files = [];
for (const r of ROOTS) walk(r, files);
const violations = findViolations(files.map((f) => ({ file: f, source: readFileSync(f, 'utf8') })));
if (violations.length) {
  console.error(`Vi phạm ranh giới module (${violations.length}):`);
  for (const v of violations) console.error(`  ${v}`);
  process.exit(1);
}
console.log(`check-boundaries: ${files.length} file, không có vi phạm.`);
