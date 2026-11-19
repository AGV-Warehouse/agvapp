#!/usr/bin/env node
/*
 * Lists Chinese UI text in the portal source that has no English entry in
 * portal-i18n-en.js. Run from the agvapp folder:
 *
 *   node tools/i18n-check.cjs          # print missing strings, exit 1 if any
 *   node tools/i18n-check.cjs --json   # same, as a JSON array
 *
 * Text is split at quotes, backticks, tag brackets and ${ } so template
 * pieces are listed separately; the runtime translates composed strings
 * piece by piece in the same way.
 */
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CJK = /[㐀-鿿]/;
const CODE = /[(){};=]|\|\||&&|=>/;

function sourceFiles() {
  const assets = JSON.parse(fs.readFileSync(path.join(ROOT, "web-assets.json"), "utf8"));
  return assets.filter((f) => /\.(js|html)$/.test(f) && !/^(sw|portal-i18n|portal-i18n-en)\.js$/.test(f));
}

function extract(files = sourceFiles()) {
  const found = new Map();
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), "utf8");
    for (let piece of src.split(/\$\{|[}'"`<>]/)) {
      piece = piece.replace(/\s+/g, " ").trim();
      if (!CJK.test(piece) || piece.length >= 400 || CODE.test(piece)) continue;
      if (!found.has(piece)) found.set(piece, new Set());
      found.get(piece).add(f);
    }
  }
  return found;
}

function missing() {
  const dict = require(path.join(ROOT, "portal-i18n-en.js"));
  return [...extract()].filter(([text]) => !Object.hasOwn(dict, text)).map(([text, files]) => ({ text, files: [...files] }));
}

module.exports = { extract, missing };

if (require.main === module) {
  const rows = missing();
  if (process.argv.includes("--json")) console.log(JSON.stringify(rows.map((r) => r.text), null, 1));
  else for (const r of rows) console.log(`${r.files.join(",")}\t${r.text}`);
  if (!process.argv.includes("--json")) console.error(`${rows.length} untranslated`);
  process.exitCode = rows.length ? 1 : 0;
}
