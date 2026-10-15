// Lists every t('...') text in src/ into src/locales/ui_strings.json, so the
// server's auto-translate (chw/translation_tool.py ui_strings) knows the
// app's own screen texts - buttons, menus, messages - not just the forms'.
// Run from frontend/: `node scripts/extract-ui-strings.mjs` (part of `yarn build`).
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const SRC = new URL("../src/", import.meta.url).pathname;
const CALL = /(?<![\w$.])t\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(vue|js|ts)$/.test(name)) out.push(path);
  }
  return out;
}

const texts = new Set();
for (const file of walk(SRC)) {
  for (const m of readFileSync(file, "utf8").matchAll(CALL)) {
    const text = m[2].replace(/\\(['"\\])/g, "$1").trim();
    if (text) texts.add(text);
  }
}
const sorted = [...texts].sort((a, b) => a.localeCompare(b));
writeFileSync(
  join(SRC, "locales", "ui_strings.json"),
  JSON.stringify(sorted, null, 1) + "\n"
);
console.log(`ui_strings.json: ${sorted.length} texts`);
