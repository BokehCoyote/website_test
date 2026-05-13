let selectedFiles = [];
let settings = null;

const $ = (selector) => document.querySelector(selector);

const elements = {
  settingsToggle: $("#settingsToggle"),
  settingsDialog: $("#settingsDialog"),
  settingsForm: $("#settingsForm"),
  closeSettings: $("#closeSettings"),
  cancelSettings: $("#cancelSettings"),
  mediaType: $("#mediaType"),
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

function readVideoForm() {
  const title = $("#title").value.trim();
  return {
    title,
    id: $("#id").value.trim() || toSlug(`${$("#gallery").value}-${title}`),
    gallery: $("#gallery").value,
    alt: $("#alt").value.trim() || `${title} video thumbnail`,
    featured: $("#featured").checked,
    youtubeUrl: $("#youtubeUrl").value.trim(),
    posterUrl: $("#posterUrl").value.trim()
  };
}

function updateMediaMode() {
  const isVideo = elements.mediaType.value === "youtube";
  document.querySelectorAll(".image-field").forEach((field) => {
    field.hidden = isVideo;
  });
  document.querySelectorAll(".video-field").forEach((field) => {
    field.hidden = !isVideo;
  });
  $("#youtubeUrl").required = isVideo;
  elements.submitButton.textContent = isVideo ? "Add Video and Commit" : "Upload and Commit";
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

function sourceLabel(post) {
  return post.mediaType === "video" ? "YouTube URL or ID" : "Cloudinary public ID(s)";
}

function sourceValue(post) {
  if (post.mediaType === "video") {
    return post.youtubeId || "";
  }
  const ids = Array.isArray(post.cloudinaryPublicIds) && post.cloudinaryPublicIds.length
    ? post.cloudinaryPublicIds
    : [post.cloudinaryPublicId].filter(Boolean);
  return ids.join("\n");
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
  meta.textContent = [
    post.gallery,
    post.uploadedAt,
    post.mediaType === "video" ? "Video" : Number(post.pageCount) > 1 ? `${post.pageCount} page comic` : "Image",
    post.hidden ? "Hidden" : "Visible"
  ].filter(Boolean).join(" - ");

  const publicId = document.createElement("small");
  publicId.textContent = post.mediaType === "video"
    ? `YouTube ${post.youtubeId || post.id}`
    : (post.cloudinaryPublicId || post.id);

  details.append(title, meta, publicId);

  const actions = document.createElement("div");
  actions.className = "post-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "secondary";
  editButton.textContent = "Edit";
  editButton.addEventListener("click", () => renderPostEditor(row, post));

  const visibilityButton = document.createElement("button");
  visibilityButton.type = "button";
  visibilityButton.className = post.hidden ? "secondary" : "danger";
  visibilityButton.textContent = post.hidden ? "Restore" : "Hide";
  visibilityButton.addEventListener("click", () => setPostHidden(post.id, !post.hidden, post.title || post.id));

  actions.append(editButton, visibilityButton);
  row.append(thumbnail, details, actions);
  return row;
}

function renderPostEditor(row, post) {
  row.classList.add("is-editing");

  const form = document.createElement("form");
  form.className = "post-edit-form";

  const titleField = document.createElement("label");
  titleField.className = "field";
  const titleLabel = document.createElement("span");
  titleLabel.textContent = "Title";
  const titleInput = document.createElement("input");
  titleInput.name = "title";
  titleInput.required = true;
  titleInput.value = post.title || "";
  titleField.append(titleLabel, titleInput);

  const sourceField = document.createElement("label");
  sourceField.className = "field";
  const sourceFieldLabel = document.createElement("span");
  sourceFieldLabel.textContent = sourceLabel(post);
  const sourceInput = document.createElement("textarea");
  sourceInput.name = "source";
  sourceInput.rows = post.mediaType === "video" ? 2 : Math.max(2, Math.min(Number(post.pageCount) || 1, 5));
  sourceInput.required = true;
  sourceInput.value = sourceValue(post);
  sourceField.append(sourceFieldLabel, sourceInput);

  form.append(titleField, sourceField);

  if (post.mediaType === "video") {
    const posterField = document.createElement("label");
    posterField.className = "field";
    const posterLabel = document.createElement("span");
    posterLabel.textContent = "Poster URL";
    const posterInput = document.createElement("input");
    posterInput.name = "posterUrl";
    posterInput.placeholder = "optional";
    posterInput.value = post.posterUrl || "";
    posterField.append(posterLabel, posterInput);
    form.append(posterField);
  }

  const actions = document.createElement("div");
  actions.className = "post-edit-actions";

  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "primary";
  saveButton.textContent = "Save";

  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "secondary";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", loadPosts);

  actions.append(saveButton, cancelButton);
  form.append(actions);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    saveButton.disabled = true;
    saveButton.textContent = "Saving...";

    const payload = {
      id: post.id,
      updates: {
        title: titleInput.value.trim()
      }
    };

    if (post.mediaType === "video") {
      payload.updates.youtubeUrl = sourceInput.value.trim();
      payload.updates.posterUrl = form.elements.posterUrl.value.trim();
    } else {
      payload.updates.cloudinaryPublicIds = sourceInput.value;
    }

    try {
      const result = await window.galleryUploader.updateArtwork(payload);
      log(`Updated ${result.item.title}.`, "success");
      await loadPosts();
    } catch (error) {
      log(error.message, "error");
      saveButton.disabled = false;
      saveButton.textContent = "Save";
    }
  });

  row.replaceChildren(form);
  titleInput.focus();
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
elements.mediaType.addEventListener("change", updateMediaMode);

elements.chooseImage.addEventListener("click", async () => {
  const selection = await window.galleryUploader.chooseImage();
  if (!selection) return;

  selectedFiles = selection.files || [{
    path: selection.path,
    name: selection.name,
    size: selection.size
  }];
  const fileCount = selectedFiles.length;
  elements.fileSummary.textContent = fileCount === 1
    ? `${selectedFiles[0].name} - ${formatBytes(selectedFiles[0].size)}`
    : `${fileCount} images selected - ${formatBytes(selection.size)}`;

  const title = $("#title");
  if (!title.value) {
    title.value = selectedFiles[0].name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
  }
});

elements.artworkForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const isVideo = elements.mediaType.value === "youtube";

  if (!isVideo && selectedFiles.length === 0) {
    log("Choose one or more images before uploading.", "error");
    return;
  }

  elements.submitButton.disabled = true;
  elements.submitButton.textContent = isVideo ? "Committing..." : "Uploading...";
  log(isVideo ? "Adding YouTube metadata to gallery.json." : `Uploading ${selectedFiles.length} image${selectedFiles.length === 1 ? "" : "s"} to Cloudinary.`);

  try {
    const result = isVideo
      ? await window.galleryUploader.addVideo({ video: readVideoForm() })
      : await window.galleryUploader.uploadArtwork({
        filePath: selectedFiles[0].path,
        filePaths: selectedFiles.map((file) => file.path),
        artwork: readArtworkForm()
      });

    elements.result.hidden = false;
    elements.resultPublicId.textContent = result.youtube?.id || result.cloudinary?.publicId || result.entry.id;
    elements.resultCommit.textContent = result.github.commitSha || "View commit";
    elements.resultCommit.href = result.github.htmlUrl || "#";
    log(`Committed ${result.entry.title}${result.cloudinary?.pageCount > 1 ? ` (${result.cloudinary.pageCount} pages)` : ""} to gallery.json.`, "success");
    await loadPosts();
  } catch (error) {
    log(error.message, "error");
  } finally {
    elements.submitButton.disabled = false;
    updateMediaMode();
  }
});

loadSettings().then(() => {
  updateMediaMode();
  log("Uploader ready.");
});
