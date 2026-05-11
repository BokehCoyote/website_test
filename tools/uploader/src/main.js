const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { v2: cloudinary } = require("cloudinary");

const DEFAULT_SETTINGS = {
  cloudinary: { cloudName: "dvv9rmejs", apiKey: "", apiSecret: "" },
  github: { owner: "BokehCoyote", repo: "website_test", branch: "main", galleryPath: "gallery.json", token: "" },
  cloudinaryFolders: { Main: "Main", Experimental: "Experimental", NSFW: "NSFW" }
};

const PUBLIC_SETTINGS = {
  cloudinary: { cloudName: true, apiKey: true, apiSecret: false },
  github: { owner: true, repo: true, branch: true, galleryPath: true, token: false },
  cloudinaryFolders: { Main: true, Experimental: true, NSFW: true }
};

function settingsPath() {
  return path.join(app.getPath("userData"), "settings.json");
}

function deepMerge(base, override) {
  const next = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(override || {})) {
    if (value && typeof value === "object" && !Array.isArray(value) && base[key]) {
      next[key] = deepMerge(base[key], value);
    } else if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}

async function readSettings() {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    return deepMerge(DEFAULT_SETTINGS, JSON.parse(raw));
  } catch (error) {
    if (error.code === "ENOENT") return DEFAULT_SETTINGS;
    throw error;
  }
}

async function writeSettings(settings) {
  const merged = deepMerge(DEFAULT_SETTINGS, settings);
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(merged, null, 2)}\n`, "utf8");
  return merged;
}

function redactSettings(settings) {
  function redactObject(value, mask) {
    const out = {};
    for (const [key, rule] of Object.entries(mask)) {
      if (rule === true) out[key] = value?.[key] || "";
      else if (rule === false) out[key] = value?.[key] ? "saved" : "";
      else out[key] = redactObject(value?.[key] || {}, rule);
    }
    return out;
  }
  return redactObject(settings, PUBLIC_SETTINGS);
}

function requireValue(value, label) {
  if (!String(value || "").trim()) throw new Error(`${label} is required.`);
}

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function cleanSegment(value) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "").replace(/[?#\\%<>+]+/g, "-");
}

function buildPublicId(settings, artwork, filePath) {
  const gallery = artwork.gallery || "Main";
  const folder = cleanSegment(settings.cloudinaryFolders?.[gallery] || gallery);
  const base = slugify(artwork.publicId || artwork.id || artwork.title || path.basename(filePath, path.extname(filePath)));
  if (!base) throw new Error("A title or public ID is required to name the Cloudinary asset.");
  return folder ? `${folder}/${base}` : base;
}

function toGalleryEntry(artwork, uploadResult) {
  return {
    id: artwork.id || slugify(`${artwork.gallery || "main"}-${artwork.title}`),
    title: artwork.title,
    year: artwork.year || new Date().getFullYear().toString(),
    medium: artwork.medium || "Digital artwork",
    dimensions: artwork.dimensions || `${uploadResult.width} x ${uploadResult.height} px`,
    gallery: artwork.gallery || "Main",
    category: artwork.category || "artwork",
    status: artwork.status || "available",
    alt: artwork.alt || artwork.title,
    cloudinaryPublicId: uploadResult.public_id,
    featured: Boolean(artwork.featured)
  };
}

async function githubRequest(settings, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${settings.github.token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "bokeh-gallery-uploader",
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try { body = JSON.parse(text); } catch { body = text; }
  }
  if (!response.ok) throw new Error(`GitHub ${response.status}: ${body?.message || response.statusText}`);
  return body;
}

async function fetchGallery(settings) {
  const { owner, repo, branch, galleryPath } = settings.github;
  const encodedPath = galleryPath.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const file = await githubRequest(settings, url);
  const content = Buffer.from(file.content || "", "base64").toString("utf8");
  const gallery = JSON.parse(content);
  if (!Array.isArray(gallery)) throw new Error(`${galleryPath} must contain a JSON array.`);
  return { file, gallery, encodedPath };
}

async function commitGallery(settings, encodedPath, sha, gallery, entry) {
  const { owner, repo, branch } = settings.github;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
  const content = Buffer.from(`${JSON.stringify(gallery, null, 2)}\n`, "utf8").toString("base64");
  return githubRequest(settings, url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: `Add ${entry.title} to gallery`, content, sha, branch })
  });
}

async function createWindow() {
  const win = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 960,
    minHeight: 680,
    title: "Bokeh Gallery Uploader",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  await win.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);
app.on("window-all-closed", () => { if (process.platform !== "darwin") app.quit(); });
app.on("activate", () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });

ipcMain.handle("settings:load", async () => redactSettings(await readSettings()));

ipcMain.handle("settings:save", async (_event, incoming) => {
  const current = await readSettings();
  const next = deepMerge(current, incoming);
  if (incoming?.cloudinary?.apiSecret === "saved") next.cloudinary.apiSecret = current.cloudinary.apiSecret;
  if (incoming?.github?.token === "saved") next.github.token = current.github.token;
  return redactSettings(await writeSettings(next));
});

ipcMain.handle("image:choose", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose optimized artwork image",
    properties: ["openFile"],
    filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "avif", "tif", "tiff"] }]
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  const stat = await fs.stat(filePath);
  return { path: filePath, name: path.basename(filePath), size: stat.size };
});

ipcMain.handle("artwork:upload", async (_event, payload) => {
  const settings = await readSettings();
  const artwork = payload?.artwork || {};
  const filePath = payload?.filePath;

  requireValue(filePath, "Image file");
  requireValue(settings.cloudinary.cloudName, "Cloudinary cloud name");
  requireValue(settings.cloudinary.apiKey, "Cloudinary API key");
  requireValue(settings.cloudinary.apiSecret, "Cloudinary API secret");
  requireValue(settings.github.owner, "GitHub owner");
  requireValue(settings.github.repo, "GitHub repo");
  requireValue(settings.github.branch, "GitHub branch");
  requireValue(settings.github.galleryPath, "GitHub gallery path");
  requireValue(settings.github.token, "GitHub token");
  requireValue(artwork.title, "Title");
  requireValue(artwork.gallery, "Gallery");

  cloudinary.config({
    cloud_name: settings.cloudinary.cloudName,
    api_key: settings.cloudinary.apiKey,
    api_secret: settings.cloudinary.apiSecret,
    secure: true
  });

  const publicId = buildPublicId(settings, artwork, filePath);
  const entryDraft = { id: artwork.id || slugify(`${artwork.gallery || "main"}-${artwork.title}`), cloudinaryPublicId: publicId };
  const { file, gallery, encodedPath } = await fetchGallery(settings);
  if (gallery.some((item) => item.id === entryDraft.id)) throw new Error(`gallery.json already contains id "${entryDraft.id}". Use a unique title or custom ID.`);
  if (gallery.some((item) => item.cloudinaryPublicId === entryDraft.cloudinaryPublicId)) throw new Error(`gallery.json already contains public ID "${entryDraft.cloudinaryPublicId}".`);

  const uploadResult = await cloudinary.uploader.upload(filePath, {
    resource_type: "image",
    public_id: publicId,
    overwrite: false,
    use_filename: false,
    unique_filename: false,
    tags: ["portfolio", artwork.gallery, artwork.category || "artwork"].filter(Boolean),
    context: { title: artwork.title, alt: artwork.alt || artwork.title, gallery: artwork.gallery }
  });

  const entry = toGalleryEntry(artwork, uploadResult);
  const commit = await commitGallery(settings, encodedPath, file.sha, [...gallery, entry], entry);
  return {
    entry,
    cloudinary: {
      publicId: uploadResult.public_id,
      secureUrl: uploadResult.secure_url,
      width: uploadResult.width,
      height: uploadResult.height,
      bytes: uploadResult.bytes,
      format: uploadResult.format
    },
    github: { commitSha: commit.commit?.sha, htmlUrl: commit.commit?.html_url || commit.content?.html_url }
  };
});
