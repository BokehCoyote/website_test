(function () {
  const ASSET_VERSION = "20260511-galleries";
  const DEFAULT_GALLERY = "main";
  const NSFW_GALLERY = "nsfw";
  const GALLERY_OPTIONS = [
    { key: "main", label: "Main" },
    { key: "experimental", label: "Experimental" },
    { key: "nsfw", label: "NSFW" }
  ];
  const PLACEHOLDER_CLOUD_NAMES = new Set([
    "",
    "replace-with-your-cloud-name",
    "your-cloud-name",
    "__cloudinary_cloud_name__"
  ]);

  const state = {
    artworks: [],
    gallery: DEFAULT_GALLERY,
    category: "all",
    status: "all",
    nsfwAccepted: false,
    activeArtworkId: null
  };

  const elements = {
    total: document.querySelector("#statTotal"),
    featured: document.querySelector("#statFeatured"),
    available: document.querySelector("#statAvailable"),
    galleryFilters: document.querySelector("#galleryFilters"),
    categoryFilters: document.querySelector("#categoryFilters"),
    statusFilters: document.querySelector("#statusFilters"),
    setupNotice: document.querySelector("#setupNotice"),
    nsfwNotice: document.querySelector("#nsfwNotice"),
    nsfwAccept: document.querySelector("#nsfwAccept"),
    nsfwBack: document.querySelector("#nsfwBack"),
    errorNotice: document.querySelector("#errorNotice"),
    grid: document.querySelector("#galleryGrid"),
    emptyState: document.querySelector("#emptyState"),
    dialog: document.querySelector("#artworkDialog"),
    dialogClose: document.querySelector("#dialogClose"),
    dialogMedia: document.querySelector("#dialogMedia"),
    dialogMeta: document.querySelector("#dialogMeta"),
    dialogTitle: document.querySelector("#dialogTitle"),
    dialogDetails: document.querySelector("#dialogDetails"),
    dialogAlt: document.querySelector("#dialogAlt"),
    dialogFullLink: document.querySelector("#dialogFullLink")
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    wireDialog();
    wireNsfwNotice();

    try {
      const data = await fetchGallery();
      state.artworks = data.map(normalizeArtwork).sort(sortArtwork);
      renderAll();
    } catch (error) {
      renderError(error);
    }
  }

  async function fetchGallery() {
    const response = await fetch(`./gallery.json?v=${ASSET_VERSION}`, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Unable to load gallery.json (${response.status}).`);
    }

    const data = await response.json();

    if (!Array.isArray(data)) {
      throw new Error("gallery.json must contain an array of artwork entries.");
    }

    return data;
  }

  function normalizeArtwork(item, index) {
    const title = cleanText(item.title, `Untitled ${index + 1}`);
    const id = cleanText(item.id, slugify(title) || `artwork-${index + 1}`);
    const gallery = cleanText(item.gallery, DEFAULT_GALLERY);
    const category = cleanText(item.category, "uncategorized");
    const status = cleanText(item.status, "unknown");

    return {
      id,
      title,
      year: cleanText(item.year, "Undated"),
      medium: cleanText(item.medium, "Medium not listed"),
      dimensions: cleanText(item.dimensions, "Dimensions not listed"),
      gallery,
      galleryKey: slugify(gallery) || DEFAULT_GALLERY,
      category,
      categoryKey: slugify(category),
      status,
      statusKey: slugify(status),
      alt: cleanText(item.alt, `${title} artwork image`),
      cloudinaryPublicId: cleanText(item.cloudinaryPublicId, ""),
      featured: Boolean(item.featured)
    };
  }

  function renderAll() {
    ensureValidFilters();
    renderSetupNotice();
    renderFilters();
    renderGallery();
  }

  function renderStats(filteredItems) {
    const galleryItems = getActiveGalleryItems();
    elements.total.textContent = galleryItems.length;
    elements.featured.textContent = galleryItems.filter((item) => item.featured).length;
    elements.available.textContent = filteredItems.length;
  }

  function renderSetupNotice() {
    elements.setupNotice.hidden = hasCloudinaryConfig();
  }

  function renderFilters() {
    renderFilterGroup(elements.galleryFilters, "gallery", GALLERY_OPTIONS, false);
    renderFilterGroup(elements.categoryFilters, "category", getFilterOptions("category"), true);
    renderFilterGroup(elements.statusFilters, "status", getFilterOptions("status"), true);
  }

  function renderFilterGroup(container, filterName, options, includeAll) {
    container.replaceChildren();

    if (includeAll) {
      container.append(createFilterButton(filterName, "all", "All", state[filterName] === "all"));
    }

    options.forEach((option) => {
      container.append(createFilterButton(filterName, option.key, option.label, state[filterName] === option.key));
    });
  }

  function createFilterButton(filterName, value, label, isActive) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "filter-button";
    button.dataset.filter = filterName;
    button.dataset.value = value;
    button.setAttribute("aria-pressed", String(isActive));
    button.textContent = label;
    button.addEventListener("click", () => {
      state[filterName] = value;

      if (filterName === "gallery") {
        state.category = "all";
        state.status = "all";
      }

      renderAll();
    });
    return button;
  }

  function renderGallery() {
    const nsfwLocked = isNsfwLocked();
    const filtered = nsfwLocked ? [] : getFilteredArtworks();

    elements.nsfwNotice.hidden = !nsfwLocked;
    elements.grid.replaceChildren();
    elements.emptyState.hidden = nsfwLocked || filtered.length > 0;
    renderStats(filtered);

    if (nsfwLocked) {
      return;
    }

    const fragment = document.createDocumentFragment();
    filtered.forEach((artwork) => fragment.append(createArtworkCard(artwork)));
    elements.grid.append(fragment);
  }

  function createArtworkCard(artwork) {
    const article = document.createElement("article");
    article.className = "art-card";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "art-card-button";
    button.dataset.artworkId = artwork.id;
    button.setAttribute("aria-label", `Open details for ${artwork.title}`);

    const media = document.createElement("div");
    media.className = "art-card-media";
    media.append(createPreviewMedia(artwork));

    const body = document.createElement("div");
    body.className = "art-card-body";
    body.innerHTML = `
      <div class="card-heading">
        <h2>${escapeHtml(artwork.title)}</h2>
        <span>${escapeHtml(artwork.year)}</span>
      </div>
      <p>${escapeHtml(artwork.medium)}</p>
      <div class="card-meta">
        <span>${escapeHtml(artwork.gallery)}</span>
        <span>${escapeHtml(artwork.category)}</span>
        <span>${escapeHtml(artwork.status)}</span>
      </div>
    `;

    if (artwork.featured) {
      const badge = document.createElement("span");
      badge.className = "featured-badge";
      badge.textContent = "Featured";
      media.append(badge);
    }

    button.append(media, body);
    button.addEventListener("click", () => openArtwork(artwork.id));
    article.append(button);
    return article;
  }

  function createPreviewMedia(artwork) {
    if (!canRenderCloudinary(artwork)) {
      return createImagePlaceholder("Cloudinary preview paused");
    }

    const image = document.createElement("img");
    image.src = cloudinaryUrl(artwork.cloudinaryPublicId, "f_auto,q_auto,c_limit,w_640");
    image.srcset = [
      `${cloudinaryUrl(artwork.cloudinaryPublicId, "f_auto,q_auto,c_limit,w_420")} 420w`,
      `${cloudinaryUrl(artwork.cloudinaryPublicId, "f_auto,q_auto,c_limit,w_640")} 640w`,
      `${cloudinaryUrl(artwork.cloudinaryPublicId, "f_auto,q_auto,c_limit,w_900")} 900w`
    ].join(", ");
    image.sizes = "(min-width: 980px) 31vw, (min-width: 680px) 46vw, 92vw";
    image.alt = artwork.alt;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.replaceWith(createImagePlaceholder("Image not found in Cloudinary"));
    }, { once: true });
    return image;
  }

  function openArtwork(id) {
    const artwork = state.artworks.find((item) => item.id === id);

    if (!artwork || (artwork.galleryKey === NSFW_GALLERY && !state.nsfwAccepted)) {
      return;
    }

    state.activeArtworkId = id;
    elements.dialogTitle.textContent = artwork.title;
    elements.dialogMeta.textContent = `${artwork.gallery} / ${artwork.category} / ${artwork.year}`;
    elements.dialogAlt.textContent = artwork.alt;
    elements.dialogDetails.replaceChildren(
      createDetail("Medium", artwork.medium),
      createDetail("Dimensions", artwork.dimensions),
      createDetail("Status", artwork.status)
    );
    elements.dialogMedia.replaceChildren(createDetailMedia(artwork));

    if (canRenderCloudinary(artwork)) {
      elements.dialogFullLink.href = cloudinaryUrl(artwork.cloudinaryPublicId, "f_auto,q_auto,c_limit,w_2600");
      elements.dialogFullLink.hidden = false;
    } else {
      elements.dialogFullLink.hidden = true;
    }

    elements.dialog.showModal();
    elements.dialogClose.focus();
  }

  function createDetailMedia(artwork) {
    if (!canRenderCloudinary(artwork)) {
      return createImagePlaceholder("Add Cloudinary config to load detail image");
    }

    const image = document.createElement("img");
    image.src = cloudinaryUrl(artwork.cloudinaryPublicId, "f_auto,q_auto,c_limit,w_1800");
    image.alt = artwork.alt;
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.replaceWith(createImagePlaceholder("Detail image not found in Cloudinary"));
    }, { once: true });
    return image;
  }

  function createDetail(label, value) {
    const wrapper = document.createElement("div");
    const term = document.createElement("dt");
    const detail = document.createElement("dd");
    term.textContent = label;
    detail.textContent = value;
    wrapper.append(term, detail);
    return wrapper;
  }

  function createImagePlaceholder(message) {
    const placeholder = document.createElement("div");
    placeholder.className = "image-placeholder";
    placeholder.textContent = message;
    return placeholder;
  }

  function wireDialog() {
    elements.dialogClose.addEventListener("click", () => elements.dialog.close());
    elements.dialog.addEventListener("click", (event) => {
      if (event.target === elements.dialog) {
        elements.dialog.close();
      }
    });
    elements.dialog.addEventListener("close", () => {
      elements.dialogMedia.replaceChildren();
      elements.dialogFullLink.hidden = true;
      state.activeArtworkId = null;
    });
  }

  function wireNsfwNotice() {
    elements.nsfwAccept.addEventListener("click", () => {
      state.nsfwAccepted = true;
      renderAll();
    });
    elements.nsfwBack.addEventListener("click", () => {
      state.gallery = DEFAULT_GALLERY;
      state.category = "all";
      state.status = "all";
      renderAll();
    });
  }

  function renderError(error) {
    elements.errorNotice.hidden = false;
    elements.errorNotice.textContent = error.message;
    elements.emptyState.hidden = false;
    elements.grid.replaceChildren();
  }

  function getFilterOptions(type) {
    const map = new Map();
    const labelKey = type;
    const valueKey = `${type}Key`;

    getActiveGalleryItems().forEach((item) => {
      if (!map.has(item[valueKey])) {
        map.set(item[valueKey], item[labelKey]);
      }
    });

    return Array.from(map, ([key, label]) => ({ key, label })).sort((a, b) => {
      return a.label.localeCompare(b.label);
    });
  }

  function getActiveGalleryItems() {
    return state.artworks.filter((item) => item.galleryKey === state.gallery);
  }

  function getFilteredArtworks() {
    return getActiveGalleryItems().filter((item) => {
      return (
        (state.category === "all" || item.categoryKey === state.category) &&
        (state.status === "all" || item.statusKey === state.status)
      );
    });
  }

  function ensureValidFilters() {
    const galleryKeys = new Set(GALLERY_OPTIONS.map((option) => option.key));
    if (!galleryKeys.has(state.gallery)) {
      state.gallery = DEFAULT_GALLERY;
    }

    const categories = new Set(getFilterOptions("category").map((option) => option.key));
    const statuses = new Set(getFilterOptions("status").map((option) => option.key));

    if (state.category !== "all" && !categories.has(state.category)) {
      state.category = "all";
    }

    if (state.status !== "all" && !statuses.has(state.status)) {
      state.status = "all";
    }
  }

  function sortArtwork(a, b) {
    const galleryCompare = galleryRank(a.galleryKey) - galleryRank(b.galleryKey);
    if (galleryCompare !== 0) {
      return galleryCompare;
    }

    if (a.featured !== b.featured) {
      return a.featured ? -1 : 1;
    }

    const yearCompare = Number.parseInt(b.year, 10) - Number.parseInt(a.year, 10);
    if (!Number.isNaN(yearCompare) && yearCompare !== 0) {
      return yearCompare;
    }

    return a.title.localeCompare(b.title);
  }

  function galleryRank(galleryKey) {
    const index = GALLERY_OPTIONS.findIndex((option) => option.key === galleryKey);
    return index === -1 ? GALLERY_OPTIONS.length : index;
  }

  function isNsfwLocked() {
    return state.gallery === NSFW_GALLERY && !state.nsfwAccepted;
  }

  function hasCloudinaryConfig() {
    const cloudName = getCloudName();
    return !PLACEHOLDER_CLOUD_NAMES.has(cloudName.toLowerCase());
  }

  function canRenderCloudinary(artwork) {
    return hasCloudinaryConfig() && artwork.cloudinaryPublicId.length > 0;
  }

  function cloudinaryUrl(publicId, transformation) {
    const cloudName = encodeURIComponent(getCloudName());
    const encodedPublicId = publicId.split("/").map(encodeURIComponent).join("/");
    return `https://res.cloudinary.com/${cloudName}/image/upload/${transformation}/${encodedPublicId}`;
  }

  function getCloudName() {
    const config = window.PORTFOLIO_CONFIG || {};
    return cleanText(config.cloudinaryCloudName, "");
  }

  function cleanText(value, fallback) {
    if (value === null || value === undefined) {
      return fallback;
    }

    const text = String(value).trim();
    return text.length > 0 ? text : fallback;
  }

  function slugify(value) {
    return cleanText(value, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  function escapeHtml(value) {
    return cleanText(value, "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
})();
