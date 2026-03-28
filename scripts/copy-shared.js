const fs = require("fs");
const path = require("path");

const src = path.join(__dirname, "..", "shared");
const dest = path.join(__dirname, "..", "functions", "shared-lib");

// Clean destination
fs.rmSync(dest, { recursive: true, force: true });
fs.mkdirSync(dest, { recursive: true });

// Copy dist directory recursively
// Skip classifier files to avoid pulling in @anthropic-ai/sdk at deploy time
const SKIP_FILES = new Set(["classifier.js", "classifier.d.ts"]);

function copyDir(s, d) {
  fs.mkdirSync(d, { recursive: true });
  for (const entry of fs.readdirSync(s, { withFileTypes: true })) {
    if (SKIP_FILES.has(entry.name)) continue;
    const sp = path.join(s, entry.name);
    const dp = path.join(d, entry.name);
    if (entry.isDirectory()) copyDir(sp, dp);
    else fs.copyFileSync(sp, dp);
  }
}

copyDir(path.join(src, "dist"), path.join(dest, "dist"));
fs.copyFileSync(path.join(src, "package.json"), path.join(dest, "package.json"));

console.log("Copied shared package to functions/shared-lib/");
