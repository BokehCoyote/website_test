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
  return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
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
    category: $("#category").value.trim(),
    status: $("#status").value,
    year: $("#year").value.trim(),
    medium: $("#medium").value.trim(),
    dimensions: $("#dimensions").value.trim(),
    alt: $("#alt").value.trim() || title,
    featured: $("#featured").checked,
    publicId: $("#publicId").value.trim()
  };
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

elements.chooseImage.addEventListener("click", async () => {
  const file = await window.galleryUploader.chooseImage();
  if (!file) return;
  selectedFile = file;
  elements.fileSummary.textContent = `${file.name} - ${formatBytes(file.size)}`;
  const title = $("#title");
  if (!title.value) title.value = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
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
    const result = await window.galleryUploader.uploadArtwork({ filePath: selectedFile.path, artwork: readArtworkForm() });
    elements.result.hidden = false;
    elements.resultPublicId.textContent = result.cloudinary.publicId;
    elements.resultCommit.textContent = result.github.commitSha || "View commit";
    elements.resultCommit.href = result.github.htmlUrl || "#";
    log(`Committed ${result.entry.title} to gallery.json.`, "success");
  } catch (error) {
    log(error.message, "error");
  } finally {
    elements.submitButton.disabled = false;
    elements.submitButton.textContent = "Upload and Commit";
  }
});

loadSettings().then(() => log("Uploader ready."));
