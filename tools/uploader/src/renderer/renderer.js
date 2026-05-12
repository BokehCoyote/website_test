let selectedFile = null;
let settings = null;

const $ = (selector) => document.querySelector(selector);

const elements = {
  settingsToggle: $("#settingsToggle"),
  settingsDialog: $("#settingsDialog"),
  settingsForm: $("#settingsForm"),
  closeSettings: $("#closeSettings"),
  cancelSettings: $("#cancelSettings"),
  chooseImage: $("#chooseImage"),
  fileSummary: $("#fileSummary"),
  artworkForm: $("#artworkForm"),
  submitButton: $("#submitButton"),
  refreshPosts: $("#refreshPosts"),
  postList: $("#postList"),
  statusLog: $("#statusLog"),
  result: $("#result"),
  resultPublicId: $("#resultPublicId"),
  resultCommit: $("#resultCommit")
};

function log(message, tone = "neutral") {
  const item = document.createElement("p");
  item.className = `log-${tone}`;
  item.textContent = message;
  elements.statusLog.prepend(item);
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function toSlug(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function setFormFromSettings(nextSettings) {
  $("#cloudName").value = nextSettings.cloudinary.cloudName || "";
  $("#apiKey").value = nextSettings.cloudinary.apiKey === "saved" ? "" : nextSettings.cloudinary.apiKey || "";
  $("#apiSecret").value = "";
  $("#apiSecret").placeholder = nextSettings.cloudinary.apiSecret === "saved" ? "Saved locally" : "";

  $("#owner").value = nextSettings.github.owner || "";
  $("#repo").value = nextSettings.github.repo || "";
  $("#branch").value = nextSettings.github.branch || "";
  $("#galleryPath").value = nextSettings.github.galleryPath || "";
  $("#token").value = "";
  $("#token").placeholder = nextSettings.github.token === "saved" ? "Saved locally" : "";

  $("#folderMain").value = nextSettings.cloudinaryFolders.Main || "Main";
  $("#folderExperimental").value = nextSettings.cloudinaryFolders.Experimental || "Experimental";
  $("#folderNsfw").value = nextSettings.cloudinaryFolders.NSFW || "NSFW";
}

async function loadSettings() {
  settings = await window.galleryUploader.loadSettings();
  setFormFromSettings(settings);
}

function readSettingsForm() {
  return {
    cloudinary: {
      cloudName: $("#cloudName").value.trim(),
      apiKey: $("#apiKey").value.trim() || settings.cloudinary.apiKey,
      apiSecret: $("#apiSecret").value || settings.cloudinary.apiSecret
    },
    github: {
      owner: $("#owner").value.trim(),
      repo: $("#repo").value.trim(),
      branch: $("#branch").value.trim(),
      galleryPath: $("#galleryPath").value.trim(),
      token: $("#token").value || settings.github.token
    },
    cloudinaryFolders: {
      Main: $("#folderMain").value.trim(),
      Experimental: $("#folderExperimental").value.trim(),
      NSFW: $("#folderNsfw").value.trim()
    }
  };
}

function readArtworkForm() {
  const title = $("#title").value.trim();
  return {
    title,
    id: $("#id").value.trim() || toSlug(`${$("#gallery").value}-${title}`),
    gallery: $("#gallery").value,
    alt: $("#alt").value.trim() || title,
    featured: $("#featured").checked,
    publicId: $("#publicId").value.trim()
  };
}

function renderPosts(posts) {
  elements.postList.replaceChildren();

  if (!posts.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No posts found in gallery.json.";
    elements.postList.append(empty);
    return;
  }

  const fragment = document.createDocumentFragment();
  posts.forEach((post) => fragment.append(createPostRow(post)));
  elements.postList.append(fragment);
}

function createPostRow(post) {
  const row = document.createElement("article");
  row.className = `post-row${post.hidden ? " is-hidden" : ""}`;

  const thumbnail = document.createElement("div");
  thumbnail.className = "post-thumb";
  if (post.thumbnailUrl) {
    const image = document.createElement("img");
    image.src = post.thumbnailUrl;
    image.alt = "";
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      thumbnail.textContent = "No image";
    }, { once: true });
    thumbnail.append(image);
  } else {
    thumbnail.textContent = "No image";
  }

  const details = document.createElement("div");
  details.className = "post-details";

  const title = document.createElement("strong");
  title.textContent = post.title || post.id;

  const meta = document.createElement("span");
  meta.textContent = [post.gallery, post.uploadedAt, post.hidden ? "Hidden" : "Visible"].filter(Boolean).join(" - ");

  const publicId = document.createElement("small");
  publicId.textContent = post.cloudinaryPublicId || post.id;

  details.append(title, meta, publicId);

  const button = document.createElement("button");
  button.type = "button";
  button.className = post.hidden ? "secondary" : "danger";
  button.textContent = post.hidden ? "Restore" : "Hide";
  button.addEventListener("click", () => setPostHidden(post.id, !post.hidden, post.title || post.id));

  row.append(thumbnail, details, button);
  return row;
}

async function loadPosts() {
  elements.refreshPosts.disabled = true;
  elements.refreshPosts.textContent = "Loading...";

  try {
    const posts = await window.galleryUploader.listArtwork();
    renderPosts(posts);
    log(`Loaded ${posts.length} posts.`);
  } catch (error) {
    log(error.message, "error");
  } finally {
    elements.refreshPosts.disabled = false;
    elements.refreshPosts.textContent = "Refresh";
  }
}

async function setPostHidden(id, hidden, title) {
  const verb = hidden ? "hide" : "restore";
  const confirmed = window.confirm(`${verb === "hide" ? "Hide" : "Restore"} "${title}"?`);

  if (!confirmed) {
    return;
  }

  try {
    const result = await window.galleryUploader.setArtworkHidden({ id, hidden });
    log(`${hidden ? "Hidden" : "Restored"} ${result.item.title}.`, "success");
    await loadPosts();
  } catch (error) {
    log(error.message, "error");
  }
}

elements.settingsToggle.addEventListener("click", () => {
  setFormFromSettings(settings);
  elements.settingsDialog.showModal();
});

elements.closeSettings.addEventListener("click", () => elements.settingsDialog.close());
elements.cancelSettings.addEventListener("click", () => elements.settingsDialog.close());

elements.settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    settings = await window.galleryUploader.saveSettings(readSettingsForm());
    setFormFromSettings(settings);
    elements.settingsDialog.close();
    log("Settings saved locally.", "success");
  } catch (error) {
    log(error.message, "error");
  }
});

elements.refreshPosts.addEventListener("click", loadPosts);

elements.chooseImage.addEventListener("click", async () => {
  const file = await window.galleryUploader.chooseImage();
  if (!file) return;

  selectedFile = file;
  elements.fileSummary.textContent = `${file.name} - ${formatBytes(file.size)}`;

  const title = $("#title");
  if (!title.value) {
    title.value = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  }
});

elements.artworkForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!selectedFile) {
    log("Choose an image before uploading.", "error");
    return;
  }

  elements.submitButton.disabled = true;
  elements.submitButton.textContent = "Uploading...";
  log("Uploading image to Cloudinary.");

  try {
    const result = await window.galleryUploader.uploadArtwork({
      filePath: selectedFile.path,
      artwork: readArtworkForm()
    });

    elements.result.hidden = false;
    elements.resultPublicId.textContent = result.cloudinary.publicId;
    elements.resultCommit.textContent = result.github.commitSha || "View commit";
    elements.resultCommit.href = result.github.htmlUrl || "#";
    log(`Committed ${result.entry.title} to gallery.json.`, "success");
    await loadPosts();
  } catch (error) {
    log(error.message, "error");
  } finally {
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = "Upload and Commit";
  }
});

loadSettings().then(() => {
  log("Uploader ready.");
});
