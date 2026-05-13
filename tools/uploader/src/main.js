const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const sharp = require("sharp");
const { DeleteObjectCommand, PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");

const IMAGE_VARIANTS = [
  { name: "thumb", fileName: "thumb.webp", max: 600, quality: 82 },
  { name: "medium", fileName: "medium.webp", max: 1600, quality: 84 },
  { name: "full", fileName: "full.webp", max: 2600, quality: 88 }
];

const DEFAULT_SETTINGS = {
  r2: {
    accountId: "",
    bucketName: "",
    accessKeyId: "",
    secretAccessKey: "",
    assetBaseUrl: "https://assets.example.com"
  },
  github: {
    owner: "BokehCoyote",
    repo: "website_test",
    branch: "main",
    galleryPath: "gallery.json",
    token: ""
  }
};

const PUBLIC_SETTINGS = {
  r2: {
    accountId: true,
    bucketName: true,
    accessKeyId: true,
    secretAccessKey: false,
    assetBaseUrl: true
  },
  github: {
    owner: true,
    repo: true,
    branch: true,
    galleryPath: true,
    token: false
  }
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
    if (error.code === "ENOENT") {
      return DEFAULT_SETTINGS;
    }
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
      if (rule === true) {
        out[key] = value?.[key] || "";
      } else if (rule === false) {
        out[key] = value?.[key] ? "saved" : "";
      } else {
        out[key] = redactObject(value?.[key] || {}, rule);
      }
    }
    return out;
  }

  return redactObject(settings, PUBLIC_SETTINGS);
}

function requireValue(value, label) {
  if (!String(value || "").trim()) {
    throw new Error(`${label} is required.`);
  }
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

function cleanAssetPath(value) {
  return String(value || "").trim().replace(/^\/+|\/+$/g, "");
}

function normalizeAssetBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/g, "");
}

function youtubeThumbnailUrl(videoId) {
  return videoId ? `https://i.ytimg.com/vi/${encodeURIComponent(videoId)}/hqdefault.jpg` : "";
}

function parseYouTubeId(value) {
  const input = String(value || "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) {
    return input;
  }

  let url;
  try {
    url = new URL(input);
  } catch {
    try {
      url = new URL(`https://${input}`);
    } catch {
      return "";
    }
  }

  const host = url.hostname.replace(/^www\./, "");
  if (host === "youtu.be") {
    const id = url.pathname.split("/").filter(Boolean)[0] || "";
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : "";
  }

  const isYoutubeHost = host === "youtube.com" || host.endsWith(".youtube.com");
  const isYoutubeNoCookieHost = host === "youtube-nocookie.com" || host.endsWith(".youtube-nocookie.com");
  if (isYoutubeHost || isYoutubeNoCookieHost) {
    const watchId = url.searchParams.get("v") || "";
    if (/^[a-zA-Z0-9_-]{11}$/.test(watchId)) {
      return watchId;
    }

    const parts = url.pathname.split("/").filter(Boolean);
    const pathId = parts.find((part, index) => ["embed", "shorts", "live"].includes(parts[index - 1])) || "";
    return /^[a-zA-Z0-9_-]{11}$/.test(pathId) ? pathId : "";
  }

  return "";
}

function newestFirst(a, b) {
  const dateCompare = Date.parse(b.uploadedAt || "") - Date.parse(a.uploadedAt || "");
  if (!Number.isNaN(dateCompare) && dateCompare !== 0) {
    return dateCompare;
  }
  return b.index - a.index;
}

function getEntryAssetPaths(item) {
  const paths = new Set();
  if (item.assetPath) {
    paths.add(cleanAssetPath(item.assetPath));
  }
  if (Array.isArray(item.pages)) {
    item.pages.forEach((page) => {
      if (page?.assetPath) {
        paths.add(cleanAssetPath(page.assetPath));
      }
    });
  }
  return [...paths].filter(Boolean);
}

function getCoverAssetPath(item) {
  if (Array.isArray(item.pages) && item.pages[0]?.assetPath) {
    return cleanAssetPath(item.pages[0].assetPath);
  }
  return cleanAssetPath(item.assetPath);
}

function getPageCount(item) {
  return Array.isArray(item.pages) && item.pages.length > 0 ? item.pages.length : 1;
}

function assetUrl(settings, assetPath, fileName) {
  const baseUrl = normalizeAssetBaseUrl(settings.r2.assetBaseUrl);
  const encodedPath = cleanAssetPath(assetPath).split("/").map(encodeURIComponent).join("/");
  return baseUrl && encodedPath ? `${baseUrl}/${encodedPath}/${encodeURIComponent(fileName)}` : "";
}

function summarizeArtwork(settings, item) {
  const mediaType = item.mediaType || "image";
  return {
    id: item.id,
    title: item.title || item.id,
    gallery: item.gallery || "Main",
    uploadedAt: item.uploadedAt || "",
    mediaType,
    videoProvider: item.videoProvider || "",
    youtubeId: item.youtubeId || "",
    assetPath: item.assetPath || "",
    assetPaths: mediaType === "video" ? [] : getEntryAssetPaths(item),
    posterUrl: item.posterUrl || "",
    pageCount: mediaType === "video" ? 1 : getPageCount(item),
    thumbnailUrl: mediaType === "video"
      ? (item.posterUrl || youtubeThumbnailUrl(item.youtubeId))
      : assetUrl(settings, getCoverAssetPath(item), "thumb.webp"),
    hidden: Boolean(item.hidden)
  };
}

function imageAssetPath(entryId, pageIndex = 0, pageCount = 1) {
  return pageCount > 1
    ? `artwork/${entryId}/pages/${String(pageIndex + 1).padStart(2, "0")}`
    : `artwork/${entryId}`;
}

function buildImageTargets(artwork, filePaths) {
  const entryId = artwork.id || slugify(`${artwork.gallery || "main"}-${artwork.title}`);
  if (!entryId) {
    throw new Error("A title or custom ID is required to name the R2 asset.");
  }

  return filePaths.map((filePath, index) => ({
    filePath,
    assetPath: imageAssetPath(entryId, index, filePaths.length),
    alt: filePaths.length > 1 ? `${artwork.alt || artwork.title} page ${index + 1}` : artwork.alt || artwork.title
  }));
}

function imageEntryFromTargets(artwork, targets, uploadedAt = new Date().toISOString().slice(0, 10)) {
  const entry = {
    id: artwork.id || slugify(`${artwork.gallery || "main"}-${artwork.title}`),
    title: artwork.title,
    gallery: artwork.gallery || "Main",
    uploadedAt,
    alt: artwork.alt || artwork.title,
    mediaType: "image",
    assetPath: targets[0].assetPath,
    featured: Boolean(artwork.featured)
  };

  if (targets.length > 1) {
    entry.pages = targets.map((target) => ({
      assetPath: target.assetPath,
      alt: target.alt
    }));
  }

  if (artwork.hidden) {
    entry.hidden = true;
  }

  return entry;
}

function toVideoGalleryEntry(video) {
  const uploadedAt = new Date().toISOString().slice(0, 10);
  const youtubeId = parseYouTubeId(video.youtubeUrl || video.youtubeId);

  if (!youtubeId) {
    throw new Error("Enter a valid YouTube URL or 11-character video ID.");
  }

  return {
    id: video.id || slugify(`${video.gallery || "main"}-${video.title}`),
    title: video.title,
    gallery: video.gallery || "Main",
    uploadedAt,
    alt: video.alt || `${video.title} video thumbnail`,
    mediaType: "video",
    videoProvider: "youtube",
    youtubeId,
    posterUrl: String(video.posterUrl || "").trim(),
    featured: Boolean(video.featured)
  };
}

function requireR2Settings(settings) {
  requireValue(settings.r2.accountId, "R2 account ID");
  requireValue(settings.r2.bucketName, "R2 bucket name");
  requireValue(settings.r2.accessKeyId, "R2 access key ID");
  requireValue(settings.r2.secretAccessKey, "R2 secret access key");
  requireValue(settings.r2.assetBaseUrl, "R2 asset base URL");
}

function createR2Client(settings) {
  return new S3Client({
    region: "auto",
    endpoint: `https://${settings.r2.accountId}.r2.cloudflarestorage.com`,
    forcePathStyle: true,
    credentials: {
      accessKeyId: settings.r2.accessKeyId,
      secretAccessKey: settings.r2.secretAccessKey
    }
  });
}

async function renderVariant(filePath, variant) {
  const { data, info } = await sharp(filePath, { limitInputPixels: false })
    .rotate()
    .toColorspace("srgb")
    .resize({
      width: variant.max,
      height: variant.max,
      fit: "inside",
      withoutEnlargement: true
    })
    .webp({ quality: variant.quality, effort: 5 })
    .toBuffer({ resolveWithObject: true });

  return {
    name: variant.name,
    fileName: variant.fileName,
    buffer: data,
    width: info.width,
    height: info.height,
    bytes: data.length
  };
}

async function uploadImageTargets(settings, targets) {
  const client = createR2Client(settings);
  const pages = [];

  for (const target of targets) {
    const variants = [];
    for (const variant of IMAGE_VARIANTS) {
      const rendered = await renderVariant(target.filePath, variant);
      const key = `${target.assetPath}/${variant.fileName}`;
      await client.send(new PutObjectCommand({
        Bucket: settings.r2.bucketName,
        Key: key,
        Body: rendered.buffer,
        ContentType: "image/webp",
        CacheControl: "public, max-age=31536000, immutable"
      }));
      variants.push({ ...rendered, key, buffer: undefined });
    }
    pages.push({ assetPath: target.assetPath, variants });
  }

  return pages;
}

async function deleteAssetPaths(settings, assetPaths) {
  if (!assetPaths.length) {
    return [];
  }

  const client = createR2Client(settings);
  const deleted = [];

  for (const assetPath of assetPaths) {
    for (const variant of IMAGE_VARIANTS) {
      const key = `${assetPath}/${variant.fileName}`;
      await client.send(new DeleteObjectCommand({
        Bucket: settings.r2.bucketName,
        Key: key
      }));
      deleted.push(key);
    }
  }

  return deleted;
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
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  if (!response.ok) {
    const message = body?.message || response.statusText;
    throw new Error(`GitHub ${response.status}: ${message}`);
  }

  return body;
}

async function fetchGallery(settings) {
  const { owner, repo, branch, galleryPath } = settings.github;
  const encodedPath = galleryPath.split("/").map(encodeURIComponent).join("/");
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}?ref=${encodeURIComponent(branch)}`;
  const file = await githubRequest(settings, url);
  const content = Buffer.from(file.content || "", "base64").toString("utf8");
  const gallery = JSON.parse(content);
  if (!Array.isArray(gallery)) {
    throw new Error(`${galleryPath} must contain a JSON array.`);
  }
  return { file, gallery, encodedPath };
}

async function commitGallery(settings, encodedPath, sha, gallery, message) {
  const { owner, repo, branch } = settings.github;
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodedPath}`;
  const content = Buffer.from(`${JSON.stringify(gallery, null, 2)}\n`, "utf8").toString("base64");
  return githubRequest(settings, url, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      message,
      content,
      sha,
      branch
    })
  });
}

function requireGithubSettings(settings) {
  requireValue(settings.github.owner, "GitHub owner");
  requireValue(settings.github.repo, "GitHub repo");
  requireValue(settings.github.branch, "GitHub branch");
  requireValue(settings.github.galleryPath, "GitHub gallery path");
  requireValue(settings.github.token, "GitHub token");
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

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle("settings:load", async () => {
  return redactSettings(await readSettings());
});

ipcMain.handle("settings:save", async (_event, incoming) => {
  const current = await readSettings();
  const next = deepMerge(current, incoming);

  if (incoming?.r2?.secretAccessKey === "saved") {
    next.r2.secretAccessKey = current.r2.secretAccessKey;
  }
  if (incoming?.github?.token === "saved") {
    next.github.token = current.github.token;
  }

  next.r2.assetBaseUrl = normalizeAssetBaseUrl(next.r2.assetBaseUrl);
  delete next[["cloud", "inary"].join("")];
  delete next[["cloud", "inaryFolders"].join("")];
  return redactSettings(await writeSettings(next));
});

ipcMain.handle("image:choose", async () => {
  const result = await dialog.showOpenDialog({
    title: "Choose optimized artwork image(s)",
    properties: ["openFile", "multiSelections"],
    filters: [
      { name: "Images", extensions: ["jpg", "jpeg", "png", "webp", "avif", "tif", "tiff"] }
    ]
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const files = await Promise.all(result.filePaths.map(async (filePath) => {
    const stat = await fs.stat(filePath);
    return {
      path: filePath,
      name: path.basename(filePath),
      size: stat.size
    };
  }));
  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  return {
    path: files[0].path,
    name: files.length === 1 ? files[0].name : `${files.length} images selected`,
    size: totalSize,
    count: files.length,
    files
  };
});

ipcMain.handle("artwork:upload", async (_event, payload) => {
  const settings = await readSettings();
  const artwork = payload?.artwork || {};
  const filePaths = Array.isArray(payload?.filePaths) && payload.filePaths.length > 0
    ? payload.filePaths
    : [payload?.filePath].filter(Boolean);

  if (filePaths.length === 0) {
    throw new Error("Image file is required.");
  }
  requireR2Settings(settings);
  requireGithubSettings(settings);
  requireValue(artwork.title, "Title");
  requireValue(artwork.gallery, "Gallery");

  const targets = buildImageTargets(artwork, filePaths);
  const entry = imageEntryFromTargets(artwork, targets);
  const { file, gallery, encodedPath } = await fetchGallery(settings);

  if (gallery.some((item) => item.id === entry.id)) {
    throw new Error(`gallery.json already contains id "${entry.id}". Use a unique title or custom ID.`);
  }

  const existingAssetPaths = new Set(gallery.flatMap(getEntryAssetPaths));
  const duplicateAssetPath = getEntryAssetPaths(entry).find((assetPath) => existingAssetPaths.has(assetPath));
  if (duplicateAssetPath) {
    throw new Error(`gallery.json already contains asset path "${duplicateAssetPath}".`);
  }

  const pages = await uploadImageTargets(settings, targets);
  const nextGallery = [...gallery, entry];
  const commit = await commitGallery(settings, encodedPath, file.sha, nextGallery, `Add ${entry.title} to gallery`);

  return {
    entry,
    image: {
      assetPath: entry.assetPath,
      pageCount: pages.length,
      pages,
      bytes: pages.reduce((sum, page) => sum + page.variants.reduce((pageSum, variant) => pageSum + variant.bytes, 0), 0)
    },
    github: {
      commitSha: commit.commit?.sha,
      htmlUrl: commit.commit?.html_url || commit.content?.html_url
    }
  };
});

ipcMain.handle("video:add", async (_event, payload) => {
  const settings = await readSettings();
  const video = payload?.video || {};

  requireGithubSettings(settings);
  requireValue(video.title, "Title");
  requireValue(video.gallery, "Gallery");
  requireValue(video.youtubeUrl || video.youtubeId, "YouTube URL or video ID");

  const entry = toVideoGalleryEntry(video);
  const { file, gallery, encodedPath } = await fetchGallery(settings);

  if (gallery.some((item) => item.id === entry.id)) {
    throw new Error(`gallery.json already contains id "${entry.id}". Use a unique title or custom ID.`);
  }
  if (gallery.some((item) => item.mediaType === "video" && item.videoProvider === "youtube" && item.youtubeId === entry.youtubeId)) {
    throw new Error(`gallery.json already contains YouTube video "${entry.youtubeId}".`);
  }

  const nextGallery = [...gallery, entry];
  const commit = await commitGallery(settings, encodedPath, file.sha, nextGallery, `Add ${entry.title} video to gallery`);

  return {
    entry,
    youtube: {
      id: entry.youtubeId,
      thumbnailUrl: youtubeThumbnailUrl(entry.youtubeId),
      watchUrl: `https://www.youtube.com/watch?v=${encodeURIComponent(entry.youtubeId)}`
    },
    github: {
      commitSha: commit.commit?.sha,
      htmlUrl: commit.commit?.html_url || commit.content?.html_url
    }
  };
});

ipcMain.handle("artwork:list", async () => {
  const settings = await readSettings();
  requireGithubSettings(settings);

  const { gallery } = await fetchGallery(settings);
  return gallery
    .map((item, index) => ({ index, ...summarizeArtwork(settings, item) }))
    .sort(newestFirst)
    .map(({ index, ...item }) => item);
});

ipcMain.handle("artwork:set-hidden", async (_event, payload) => {
  const settings = await readSettings();
  const id = payload?.id;
  const hidden = Boolean(payload?.hidden);

  requireValue(id, "Artwork ID");
  requireGithubSettings(settings);

  const { file, gallery, encodedPath } = await fetchGallery(settings);
  const index = gallery.findIndex((item) => item.id === id);

  if (index === -1) {
    throw new Error(`gallery.json does not contain id "${id}".`);
  }

  const item = gallery[index];
  const nextItem = { ...item };

  if (hidden) {
    nextItem.hidden = true;
  } else {
    delete nextItem.hidden;
  }

  const nextGallery = gallery.map((entry, entryIndex) => (entryIndex === index ? nextItem : entry));
  const action = hidden ? "Hide" : "Restore";
  const commit = await commitGallery(settings, encodedPath, file.sha, nextGallery, `${action} ${item.title || id}`);

  return {
    item: summarizeArtwork(settings, nextItem),
    github: {
      commitSha: commit.commit?.sha,
      htmlUrl: commit.commit?.html_url || commit.content?.html_url
    }
  };
});

ipcMain.handle("artwork:update", async (_event, payload) => {
  const settings = await readSettings();
  const id = payload?.id;
  const updates = payload?.updates || {};
  const filePaths = Array.isArray(payload?.filePaths) ? payload.filePaths.filter(Boolean) : [];

  requireValue(id, "Artwork ID");
  requireGithubSettings(settings);

  const { file, gallery, encodedPath } = await fetchGallery(settings);
  const index = gallery.findIndex((item) => item.id === id);

  if (index === -1) {
    throw new Error(`gallery.json does not contain id "${id}".`);
  }

  const item = gallery[index];
  const title = String(updates.title || "").trim();
  requireValue(title, "Title");

  let nextItem = { ...item, title };
  let imageResult = null;
  let deletedKeys = [];

  if (item.mediaType === "video") {
    const youtubeId = parseYouTubeId(updates.youtubeUrl || updates.youtubeId || item.youtubeId);
    if (!youtubeId) {
      throw new Error("Enter a valid YouTube URL or 11-character video ID.");
    }
    const duplicateVideo = gallery.some((entry, entryIndex) => (
      entryIndex !== index
      && entry.mediaType === "video"
      && entry.videoProvider === "youtube"
      && entry.youtubeId === youtubeId
    ));
    if (duplicateVideo) {
      throw new Error(`gallery.json already contains YouTube video "${youtubeId}".`);
    }
    nextItem.youtubeId = youtubeId;
    nextItem.posterUrl = String(updates.posterUrl || "").trim();
    nextItem.videoProvider = "youtube";
  } else if (filePaths.length > 0) {
    requireR2Settings(settings);
    const oldAssetPaths = getEntryAssetPaths(item);
    const targets = buildImageTargets({
      id: item.id,
      title,
      gallery: item.gallery || "Main",
      alt: updates.alt || title,
      featured: Boolean(item.featured),
      hidden: Boolean(item.hidden)
    }, filePaths);
    const pages = await uploadImageTargets(settings, targets);
    nextItem = imageEntryFromTargets({
      id: item.id,
      title,
      gallery: item.gallery || "Main",
      alt: updates.alt || title,
      featured: Boolean(item.featured),
      hidden: Boolean(item.hidden)
    }, targets);
    const nextAssetPaths = new Set(getEntryAssetPaths(nextItem));
    const staleAssetPaths = oldAssetPaths.filter((assetPath) => !nextAssetPaths.has(assetPath));
    imageResult = {
      assetPath: nextItem.assetPath,
      pageCount: pages.length,
      pages,
      bytes: pages.reduce((sum, page) => sum + page.variants.reduce((pageSum, variant) => pageSum + variant.bytes, 0), 0)
    };

    const nextGallery = gallery.map((entry, entryIndex) => (entryIndex === index ? nextItem : entry));
    const commit = await commitGallery(settings, encodedPath, file.sha, nextGallery, `Update ${title}`);
    deletedKeys = await deleteAssetPaths(settings, staleAssetPaths);

    return {
      item: summarizeArtwork(settings, nextItem),
      image: imageResult,
      deletedKeys,
      github: {
        commitSha: commit.commit?.sha,
        htmlUrl: commit.commit?.html_url || commit.content?.html_url
      }
    };
  }

  if (!nextItem.alt || nextItem.alt === item.title) {
    nextItem.alt = title;
  }

  const nextGallery = gallery.map((entry, entryIndex) => (entryIndex === index ? nextItem : entry));
  const commit = await commitGallery(settings, encodedPath, file.sha, nextGallery, `Update ${title}`);

  return {
    item: summarizeArtwork(settings, nextItem),
    image: imageResult,
    deletedKeys,
    github: {
      commitSha: commit.commit?.sha,
      htmlUrl: commit.commit?.html_url || commit.content?.html_url
    }
  };
});
