const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const fs = require("fs/promises");
const { v2: cloudinary } = require("cloudinary");

const DEFAULT_SETTINGS = {
  cloudinary: {
    cloudName: "dvv9rmejs",
    apiKey: "",
    apiSecret: ""
  },
  github: {
    owner: "BokehCoyote",
    repo: "website_test",
    branch: "main",
    galleryPath: "gallery.json",
    token: ""
  },
  cloudinaryFolders: {
    Main: "Main",
    Experimental: "Experimental",
    NSFW: "NSFW"
  }
};

const PUBLIC_SETTINGS = {
  cloudinary: {
    cloudName: true,
    apiKey: true,
    apiSecret: false
  },
  github: {
    owner: true,
    repo: true,
    branch: true,
    galleryPath: true,
    token: false
  },
  cloudinaryFolders: {
    Main: true,
    Experimental: true,
    NSFW: true
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

function cleanSegment(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[?#\\%<>+]+/g, "-");
}

function buildUploadTarget(settings, artwork, filePath, pageIndex = 0, pageCount = 1) {
  const gallery = artwork.gallery || "Main";
  const folder = cleanSegment(settings.cloudinaryFolders?.[gallery] || gallery);
  const base = slugify(artwork.publicId || artwork.id || artwork.title || path.basename(filePath, path.extname(filePath)));
  if (!base) {
    throw new Error("A title or public ID is required to name the Cloudinary asset.");
  }
  const pageBase = pageCount > 1 ? `${base}-${String(pageIndex + 1).padStart(2, "0")}` : base;
  return {
    folder,
    publicId: folder ? `${folder}/${pageBase}` : pageBase,
    uploadPublicId: pageBase
  };
}

function cloudinaryDeliveryUrl(settings, publicId, transformation) {
  const cloudName = encodeURIComponent(settings.cloudinary.cloudName || "");
  const encodedPublicId = String(publicId || "").split("/").map(encodeURIComponent).join("/");
  if (!cloudName || !encodedPublicId) {
    return "";
  }
  return `https://res.cloudinary.com/${cloudName}/image/upload/${transformation}/${encodedPublicId}`;
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

function getEntryPublicIds(item) {
  const ids = new Set();
  if (item.cloudinaryPublicId) {
    ids.add(item.cloudinaryPublicId);
  }
  if (Array.isArray(item.pages)) {
    item.pages.forEach((page) => {
      if (page?.cloudinaryPublicId) {
        ids.add(page.cloudinaryPublicId);
      }
    });
  }
  return [...ids];
}

function getCoverPublicId(item) {
  if (Array.isArray(item.pages) && item.pages[0]?.cloudinaryPublicId) {
    return item.pages[0].cloudinaryPublicId;
  }
  return item.cloudinaryPublicId || "";
}

function getPageCount(item) {
  return Array.isArray(item.pages) && item.pages.length > 0 ? item.pages.length : 1;
}

function summarizeArtwork(settings, item) {
  return {
    id: item.id,
    title: item.title || item.id,
    gallery: item.gallery || "Main",
    uploadedAt: item.uploadedAt || "",
    mediaType: item.mediaType || "image",
    videoProvider: item.videoProvider || "",
    youtubeId: item.youtubeId || "",
    cloudinaryPublicId: item.cloudinaryPublicId || "",
    cloudinaryPublicIds: item.mediaType === "video" ? [] : getEntryPublicIds(item),
    posterUrl: item.posterUrl || "",
    pageCount: item.mediaType === "video" ? 1 : getPageCount(item),
    thumbnailUrl: item.mediaType === "video"
      ? (item.posterUrl || youtubeThumbnailUrl(item.youtubeId))
      : cloudinaryDeliveryUrl(settings, getCoverPublicId(item), "f_auto,q_auto,c_fill,w_112,h_112"),
    hidden: Boolean(item.hidden)
  };
}

function normalizeCloudinaryPublicIds(value) {
  const ids = String(value || "")
    .split(/\r?\n|,/)
    .map((item) => item.trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean);
  return [...new Set(ids)];
}

function updateImageSource(item, publicIds, title) {
  if (!publicIds.length) {
    throw new Error("At least one Cloudinary public ID is required.");
  }

  const nextItem = { ...item, cloudinaryPublicId: publicIds[0] };
  if (publicIds.length > 1) {
    nextItem.pages = publicIds.map((cloudinaryPublicId, index) => ({
      cloudinaryPublicId,
      alt: `${title} page ${index + 1}`
    }));
  } else {
    delete nextItem.pages;
  }

  return nextItem;
}

function toGalleryEntry(artwork, uploadResults) {
  const uploadedAt = new Date().toISOString().slice(0, 10);
  const results = Array.isArray(uploadResults) ? uploadResults : [uploadResults];
  const pages = results.map((result, index) => ({
    cloudinaryPublicId: result.public_id,
    alt: `${artwork.alt || artwork.title} page ${index + 1}`
  }));

  const entry = {
    id: artwork.id || slugify(`${artwork.gallery || "main"}-${artwork.title}`),
    title: artwork.title,
    gallery: artwork.gallery || "Main",
    uploadedAt,
    alt: artwork.alt || artwork.title,
    cloudinaryPublicId: results[0].public_id,
    featured: Boolean(artwork.featured)
  };

  if (pages.length > 1) {
    entry.pages = pages;
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

  if (incoming?.cloudinary?.apiSecret === "saved") {
    next.cloudinary.apiSecret = current.cloudinary.apiSecret;
  }
  if (incoming?.github?.token === "saved") {
    next.github.token = current.github.token;
  }

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

  const uploadTargets = filePaths.map((filePath, index) => buildUploadTarget(settings, artwork, filePath, index, filePaths.length));
  const entryDraft = {
    id: artwork.id || slugify(`${artwork.gallery || "main"}-${artwork.title}`),
    cloudinaryPublicIds: uploadTargets.map((target) => target.publicId)
  };
  const { file, gallery, encodedPath } = await fetchGallery(settings);

  if (gallery.some((item) => item.id === entryDraft.id)) {
    throw new Error(`gallery.json already contains id "${entryDraft.id}". Use a unique title or custom ID.`);
  }

  const existingPublicIds = new Set(gallery.flatMap(getEntryPublicIds));
  const duplicatePublicId = entryDraft.cloudinaryPublicIds.find((publicId) => existingPublicIds.has(publicId));
  if (duplicatePublicId) {
    throw new Error(`gallery.json already contains public ID "${duplicatePublicId}".`);
  }

  const uploadResults = [];
  for (const [index, filePath] of filePaths.entries()) {
    const uploadTarget = uploadTargets[index];
    const uploadResult = await cloudinary.uploader.upload(filePath, {
      resource_type: "image",
      public_id: uploadTarget.uploadPublicId,
      folder: uploadTarget.folder || undefined,
      asset_folder: uploadTarget.folder || undefined,
      overwrite: false,
      use_filename: false,
      unique_filename: false,
      tags: ["portfolio", artwork.gallery, filePaths.length > 1 ? "comic" : ""].filter(Boolean),
      context: {
        title: artwork.title,
        alt: filePaths.length > 1 ? `${artwork.alt || artwork.title} page ${index + 1}` : artwork.alt || artwork.title,
        gallery: artwork.gallery,
        page: String(index + 1),
        page_count: String(filePaths.length)
      }
    });
    uploadResults.push(uploadResult);
  }

  const entry = toGalleryEntry(artwork, uploadResults);
  const nextGallery = [...gallery, entry];
  const commit = await commitGallery(settings, encodedPath, file.sha, nextGallery, `Add ${entry.title} to gallery`);

  return {
    entry,
    cloudinary: {
      publicId: uploadResults[0].public_id,
      secureUrl: uploadResults[0].secure_url,
      width: uploadResults[0].width,
      height: uploadResults[0].height,
      bytes: uploadResults.reduce((sum, result) => sum + (result.bytes || 0), 0),
      format: uploadResults[0].format,
      pageCount: uploadResults.length,
      pages: uploadResults.map((result) => ({
        publicId: result.public_id,
        secureUrl: result.secure_url,
        width: result.width,
        height: result.height,
        bytes: result.bytes,
        format: result.format
      }))
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

  requireValue(settings.github.owner, "GitHub owner");
  requireValue(settings.github.repo, "GitHub repo");
  requireValue(settings.github.branch, "GitHub branch");
  requireValue(settings.github.galleryPath, "GitHub gallery path");
  requireValue(settings.github.token, "GitHub token");
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

  requireValue(settings.github.owner, "GitHub owner");
  requireValue(settings.github.repo, "GitHub repo");
  requireValue(settings.github.branch, "GitHub branch");
  requireValue(settings.github.galleryPath, "GitHub gallery path");
  requireValue(settings.github.token, "GitHub token");

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
  requireValue(settings.github.owner, "GitHub owner");
  requireValue(settings.github.repo, "GitHub repo");
  requireValue(settings.github.branch, "GitHub branch");
  requireValue(settings.github.galleryPath, "GitHub gallery path");
  requireValue(settings.github.token, "GitHub token");

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

  requireValue(id, "Artwork ID");
  requireValue(settings.github.owner, "GitHub owner");
  requireValue(settings.github.repo, "GitHub repo");
  requireValue(settings.github.branch, "GitHub branch");
  requireValue(settings.github.galleryPath, "GitHub gallery path");
  requireValue(settings.github.token, "GitHub token");

  const { file, gallery, encodedPath } = await fetchGallery(settings);
  const index = gallery.findIndex((item) => item.id === id);

  if (index === -1) {
    throw new Error(`gallery.json does not contain id "${id}".`);
  }

  const item = gallery[index];
  const title = String(updates.title || "").trim();
  requireValue(title, "Title");

  let nextItem = { ...item, title };

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
  } else {
    const publicIds = normalizeCloudinaryPublicIds(updates.cloudinaryPublicIds || updates.cloudinaryPublicId);
    const existingIds = gallery.flatMap((entry, entryIndex) => (entryIndex === index ? [] : getEntryPublicIds(entry)));
    const duplicatePublicId = publicIds.find((publicId) => existingIds.includes(publicId));
    if (duplicatePublicId) {
      throw new Error(`gallery.json already contains public ID "${duplicatePublicId}".`);
    }
    nextItem = updateImageSource(nextItem, publicIds, title);
  }

  if (!nextItem.alt || nextItem.alt === item.title) {
    nextItem.alt = title;
  }

  const nextGallery = gallery.map((entry, entryIndex) => (entryIndex === index ? nextItem : entry));
  const commit = await commitGallery(settings, encodedPath, file.sha, nextGallery, `Update ${title}`);

  return {
    item: summarizeArtwork(settings, nextItem),
    github: {
      commitSha: commit.commit?.sha,
      htmlUrl: commit.commit?.html_url || commit.content?.html_url
    }
  };
});
