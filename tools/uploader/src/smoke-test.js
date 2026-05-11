const fs = require("fs");
const path = require("path");

const required = [
  "src/main.js",
  "src/preload.js",
  "src/renderer/index.html",
  "src/renderer/renderer.js",
  "src/renderer/styles.css"
];

for (const file of required) {
  const fullPath = path.join(__dirname, "..", file);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Missing ${file}`);
  }
}

const sourceFiles = required.map((file) => fs.readFileSync(path.join(__dirname, "..", file), "utf8"));
const forbiddenPatterns = [
  /apiSecret\s*:\s*["'][^"']{8,}["']/i,
  /token\s*:\s*["'](?:ghp_|github_pat_)[^"']+["']/i
];

for (const source of sourceFiles) {
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      throw new Error("Secret material must not be committed in source files.");
    }
  }
}

console.log("Uploader smoke test passed.");
