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
  /secretAccessKey\s*:\s*["'][^"']{8,}["']/i,
  /token\s*:\s*["'](?:ghp_|github_pat_)[^"']+["']/i
];

for (const source of sourceFiles) {
  for (const pattern of forbiddenPatterns) {
    if (pattern.test(source)) {
      throw new Error("Secret material must not be committed in source files.");
    }
  }
}

const mainSource = fs.readFileSync(path.join(__dirname, "main.js"), "utf8");
if (!mainSource.includes('ipcMain.handle("video:add"')) {
  throw new Error("Uploader must expose the YouTube video metadata flow.");
}
if (!mainSource.includes('ipcMain.handle("artwork:update"')) {
  throw new Error("Uploader must expose the Manage Posts edit flow.");
}
if (!mainSource.includes("PutObjectCommand") || !mainSource.includes("DeleteObjectCommand")) {
  throw new Error("Uploader must upload and delete R2 objects through the S3-compatible API.");
}
if (!mainSource.includes("sharp(") || !mainSource.includes("thumb.webp") || !mainSource.includes("medium.webp") || !mainSource.includes("full.webp")) {
  throw new Error("Uploader must generate thumb, medium, and full WebP variants.");
}
if (mainSource.toLowerCase().includes(["cloud", "inary"].join(""))) {
  throw new Error("Uploader main process must not use the legacy image host.");
}

const rendererSource = fs.readFileSync(path.join(__dirname, "renderer", "renderer.js"), "utf8");
if (!rendererSource.includes("window.galleryUploader.addVideo")) {
  throw new Error("Renderer must call the YouTube video metadata flow.");
}
if (!rendererSource.includes("window.galleryUploader.updateArtwork")) {
  throw new Error("Renderer must call the Manage Posts edit flow.");
}
if (!rendererSource.includes("filePaths: selectedFiles.map")) {
  throw new Error("Renderer must pass multi-image selections to the upload flow.");
}
if (!rendererSource.includes("payload.filePaths = replacementFiles.map")) {
  throw new Error("Manage Posts must support image replacement.");
}

if (!mainSource.includes("multiSelections") || !mainSource.includes("entry.pages = targets.map")) {
  throw new Error("Uploader must support multi-page comic uploads.");
}

console.log("Uploader smoke test passed.");
