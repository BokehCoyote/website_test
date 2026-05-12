(function () {
  const ASSET_VERSION = "20260512-layout";
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
    nsfwAccepted: false,
    activeArtworkId: null,
    activePageIndex: 0
  };

  const elements = {
    total: document.querySelector("#statTotal"),
    featured: document.querySelector("#statFeatured"),
    available: document.querySelector("#statAvailable"),
    galleryFilters: document.querySelector("#galleryFilters"),
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
      state.artworks = data.filter((item) => !item.hidden).map(normalizeArtwork).sort(sortArtwork);
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
    const uploadedAt = cleanText(item.uploadedAt, cleanText(item.year, ""));
    const mediaType = cleanText(item.mediaType, "image").toLowerCase();
    const pages = mediaType === "video" ? [] : normalizePages(item, title);
    const coverPage = pages[0] || null;

    return {
      id,
      title,
      uploadedAt,
      gallery,
      galleryKey: slugify(gallery) || DEFAULT_GALLERY,
      alt: cleanText(item.alt, coverPage?.alt || `${title} artwork image`),
      mediaType,
      videoProvider: cleanText(item.videoProvider, "").toLowerCase(),
      youtubeId: cleanText(item.youtubeId, ""),
      posterUrl: cleanText(item.posterUrl, ""),
      cloudinaryPublicId: cleanText(item.cloudinaryPublicId, coverPage?.cloudinaryPublicId || ""),
      pages,
      featured: Boolean(item.featured)
    };
  }

  function normalizePages(item, title) {
    const rawPages = Array.isArray(item.pages) ? item.pages : [];
    const pages = rawPages
      .map((page, index) => {
        const isObject = page && typeof page === "object";
        const cloudinaryPublicId = cleanText(isObject ? page.cloudinaryPublicId : page, "");
        if (!cloudinaryPublicId) {
          return null;
        }
        return {
          cloudinaryPublicId,
          alt: cleanText(isObject ? page.alt : "", `${title} page ${index + 1}`)
        };
      })
      .filter(Boolean);

    if (pages.length > 0) {
      return pages;
    }

    const cloudinaryPublicId = cleanText(item.cloudinaryPublicId, "");
    return cloudinaryPublicId ? [{
      cloudinaryPublicId,
      alt: cleanText(item.alt, `${title} artwork image`)
    }] : [];
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
    article.className = `art-card${isYoutubeVideo(artwork) ? " art-card-video" : ""}`;

    const button = document.createElement("button");
    button.type = "button";
    button.className = "art-card-button";
    button.dataset.artworkId = artwork.id;
    button.setAttribute("aria-label", `Open details for ${artwork.title}`);

    const media = document.createElement("div");
    media.className = "art-card-media";
    media.append(createPreviewMedia(artwork));

    button.append(media);
    button.addEventListener("click", () => openArtwork(artwork.id));
    article.append(button);
    return article;
  }

  function createPreviewMedia(artwork) {
    if (isYoutubeVideo(artwork)) {
      return createVideoPreview(artwork);
    }

    const coverPage = getArtworkPage(artwork, 0);
    if (!canRenderCloudinaryPage(coverPage)) {
      return createImagePlaceholder("Cloudinary preview paused");
    }

    const image = document.createElement("img");
    image.src = cloudinaryUrl(coverPage.cloudinaryPublicId, "f_auto,q_auto,c_limit,w_640");
    image.srcset = [
      `${cloudinaryUrl(coverPage.cloudinaryPublicId, "f_auto,q_auto,c_limit,w_420")} 420w`,
      `${cloudinaryUrl(coverPage.cloudinaryPublicId, "f_auto,q_auto,c_limit,w_640")} 640w`,
      `${cloudinaryUrl(coverPage.cloudinaryPublicId, "f_auto,q_auto,c_limit,w_900")} 900w`
    ].join(", ");
    image.sizes = "(min-width: 980px) 31vw, (min-width: 680px) 46vw, 92vw";
    image.alt = coverPage.alt;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.replaceWith(createImagePlaceholder("Image not found in Cloudinary"));
    }, { once: true });
    return image;
  }

  function createVideoPreview(artwork) {
    const posterUrl = getVideoPosterUrl(artwork);
    if (!posterUrl) {
      return createImagePlaceholder("Video thumbnail unavailable");
    }

    const wrapper = document.createElement("div");
    wrapper.className = "video-preview";

    const image = document.createElement("img");
    image.src = posterUrl;
    image.alt = artwork.alt;
    image.loading = "lazy";
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.replaceWith(createImagePlaceholder("Video thumbnail unavailable"));
    }, { once: true });

    const play = document.createElement("span");
    play.className = "play-badge";
    play.setAttribute("aria-hidden", "true");
    play.textContent = "Play";

    wrapper.append(image, play);
    return wrapper;
  }

  function openArtwork(id) {
    const artwork = state.artworks.find((item) => item.id === id);

    if (!artwork || (artwork.galleryKey === NSFW_GALLERY && !state.nsfwAccepted)) {
      return;
    }

    state.activeArtworkId = id;
    state.activePageIndex = 0;
    elements.dialog.classList.toggle("is-video", isYoutubeVideo(artwork));
    elements.dialogTitle.textContent = artwork.title;
    elements.dialogMeta.textContent = [artwork.gallery, artwork.uploadedAt ? `Uploaded ${formatDate(artwork.uploadedAt)}` : ""]
      .filter(Boolean)
      .join(" / ");
    elements.dialogDetails.replaceChildren();
    renderDialogMedia(artwork);

    elements.dialog.showModal();
    elements.dialogClose.focus();
  }

  function renderDialogMedia(artwork) {
    elements.dialogMedia.replaceChildren(createDetailMedia(artwork));

    if (isYoutubeVideo(artwork)) {
      elements.dialogAlt.textContent = artwork.alt;
      elements.dialogFullLink.href = youtubeWatchUrl(artwork.youtubeId);
      elements.dialogFullLink.textContent = "Open on YouTube";
      elements.dialogFullLink.hidden = false;
      return;
    }

    const page = getArtworkPage(artwork, state.activePageIndex);
    elements.dialogAlt.textContent = page?.alt || artwork.alt;

    if (canRenderCloudinaryPage(page)) {
      elements.dialogFullLink.href = cloudinaryUrl(page.cloudinaryPublicId, "f_auto,q_auto,c_limit,w_2600");
      elements.dialogFullLink.textContent = isComic(artwork) ? `View page ${state.activePageIndex + 1} larger` : "View larger image";
      elements.dialogFullLink.hidden = false;
    } else {
      elements.dialogFullLink.hidden = true;
    }
  }

  function createDetailMedia(artwork) {
    if (isYoutubeVideo(artwork)) {
      return createYoutubeEmbed(artwork);
    }

    const page = getArtworkPage(artwork, state.activePageIndex);
    if (!canRenderCloudinaryPage(page)) {
      return createImagePlaceholder("Add Cloudinary config to load detail image");
    }

    const wrapper = document.createElement("div");
    wrapper.className = "comic-reader";

    const image = document.createElement("img");
    image.src = cloudinaryUrl(page.cloudinaryPublicId, "f_auto,q_auto,c_limit,w_1800");
    image.alt = page.alt;
    image.decoding = "async";
    image.addEventListener("error", () => {
      image.replaceWith(createImagePlaceholder("Detail image not found in Cloudinary"));
    }, { once: true });

    wrapper.append(image);

    if (isComic(artwork)) {
      wrapper.append(createComicNavButton(artwork, -1), createComicNavButton(artwork, 1), createPageCounter(artwork));
    }

    return wrapper;
  }

  function createComicNavButton(artwork, direction) {
    const button = document.createElement("button");
    const isPrevious = direction < 0;
    button.type = "button";
    button.className = `comic-nav comic-nav-${isPrevious ? "prev" : "next"}`;
    button.textContent = isPrevious ? "Previous page" : "Next page";
    button.setAttribute("aria-label", isPrevious ? "Previous comic page" : "Next comic page");
    button.disabled = isPrevious ? state.activePageIndex === 0 : state.activePageIndex >= artwork.pages.length - 1;
    button.addEventListener("click", (event) => {
      event.stopPropagation();
      showComicPage(direction);
    });
    return button;
  }

  function createPageCounter(artwork) {
    const counter = document.createElement("p");
    counter.className = "comic-counter";
    counter.textContent = `${state.activePageIndex + 1} / ${artwork.pages.length}`;
    return counter;
  }

  function createYoutubeEmbed(artwork) {
    if (!artwork.youtubeId) {
      return createImagePlaceholder("Missing YouTube video ID");
    }

    const wrapper = document.createElement("div");
    wrapper.className = "video-embed";

    const iframe = document.createElement("iframe");
    iframe.title = artwork.title;
    iframe.src = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(artwork.youtubeId)}?autoplay=1&playsinline=1&rel=0`;
    iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share";
    iframe.allowFullscreen = true;
    iframe.loading = "eager";
    iframe.referrerPolicy = "strict-origin-when-cross-origin";

    wrapper.append(iframe);
    return wrapper;
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
    elements.dialog.addEventListener("keydown", (event) => {
      if (event.key === "ArrowLeft") {
        showComicPage(-1);
      } else if (event.key === "ArrowRight") {
        showComicPage(1);
      }
    });
    elements.dialog.addEventListener("close", () => {
      elements.dialogMedia.replaceChildren();
      elements.dialogFullLink.hidden = true;
      elements.dialog.classList.remove("is-video");
      state.activeArtworkId = null;
      state.activePageIndex = 0;
    });
  }

  function wireNsfwNotice() {
    elements.nsfwAccept.addEventListener("click", () => {
      state.nsfwAccepted = true;
      renderAll();
    });
    elements.nsfwBack.addEventListener("click", () => {
      state.gallery = DEFAULT_GALLERY;
      renderAll();
    });
  }

  function renderError(error) {
    elements.errorNotice.hidden = false;
    elements.errorNotice.textContent = error.message;
    elements.emptyState.hidden = false;
    elements.grid.replaceChildren();
  }

  function getActiveGalleryItems() {
    return state.artworks.filter((item) => item.galleryKey === state.gallery);
  }

  function getFilteredArtworks() {
    return getActiveGalleryItems();
  }

  function ensureValidFilters() {
    const galleryKeys = new Set(GALLERY_OPTIONS.map((option) => option.key));
    if (!galleryKeys.has(state.gallery)) {
      state.gallery = DEFAULT_GALLERY;
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

    const dateCompare = parseDateValue(b.uploadedAt) - parseDateValue(a.uploadedAt);
    if (dateCompare !== 0) {
      return dateCompare;
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

  function canRenderCloudinaryPage(page) {
    return hasCloudinaryConfig() && Boolean(page?.cloudinaryPublicId);
  }

  function isYoutubeVideo(artwork) {
    return artwork.mediaType === "video" && artwork.videoProvider === "youtube";
  }

  function isComic(artwork) {
    return !isYoutubeVideo(artwork) && artwork.pages.length > 1;
  }

  function getArtworkPage(artwork, index) {
    return artwork.pages[Math.max(0, Math.min(index, artwork.pages.length - 1))] || null;
  }

  function showComicPage(direction) {
    const artwork = state.artworks.find((item) => item.id === state.activeArtworkId);
    if (!artwork || !isComic(artwork)) {
      return;
    }

    const nextIndex = state.activePageIndex + direction;
    if (nextIndex < 0 || nextIndex >= artwork.pages.length) {
      return;
    }

    state.activePageIndex = nextIndex;
    renderDialogMedia(artwork);
  }

  function getVideoPosterUrl(artwork) {
    if (artwork.posterUrl) {
      return artwork.posterUrl;
    }
    if (!artwork.youtubeId) {
      return "";
    }
    return `https://i.ytimg.com/vi/${encodeURIComponent(artwork.youtubeId)}/hqdefault.jpg`;
  }

  function youtubeWatchUrl(videoId) {
    return `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}`;
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

  function parseDateValue(value) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? 0 : time;
  }

  function formatDate(value) {
    const time = parseDateValue(value);
    if (!time) {
      return value;
    }

    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric"
    }).format(new Date(time));
  }

  function slugify(value) {
    return cleanText(value, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }
})();
