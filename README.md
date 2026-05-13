# Bokeh Coyote Gallery Test

Plain static GitHub Pages gallery for an art portfolio workflow with Cloudflare R2-hosted images, YouTube-hosted videos, and local JSON metadata.

## Local Preview

Run a static server from the repository root:

```sh
python3 -m http.server 4173
```

Open `http://localhost:4173/`. Do not use `file://`, because the site fetches `gallery.json`.

## Media Setup

1. Create an R2 Standard bucket and attach a custom public domain.
2. Set `assetBaseUrl` in `assets/js/config.js` to that custom domain, such as `https://assets.example.com`.
3. Use the desktop uploader to generate `thumb.webp`, `medium.webp`, and `full.webp` variants and upload them to R2.
4. For videos, upload to YouTube as public or unlisted and copy the video URL or ID.
5. Commit and push. GitHub Pages republishes the static site.

The site loads pre-generated R2 image variants with lazy loading. Gallery cards use `thumb.webp`, the image view uses `medium.webp`, and the download/open-larger button links to `full.webp`. Multi-page comics use the first page as the cover and show previous/next controls in the detail modal.

YouTube posts render a thumbnail in the gallery and load the `youtube-nocookie.com` embed only when the post is opened.

## Desktop Uploader

An experimental local Electron uploader lives in `tools/uploader`. It generates WebP image variants, uploads them to R2 through the S3-compatible API, adds YouTube video metadata, appends entries to `gallery.json`, and commits JSON changes back to GitHub.

Run it from Finder by double-clicking `Open Gallery Uploader.command`, or run it locally:

```sh
cd tools/uploader
npm install
npm start
```

The uploader stores R2 and GitHub credentials in Electron's local app data directory on your machine. Do not commit R2 secrets or GitHub tokens. The GitHub token should be a fine-grained personal access token scoped to this repository with Contents read/write access.

## `gallery.json` Fields

Image entries use this shape:

```json
{
  "id": "night-window-2026",
  "title": "Night Window",
  "gallery": "Main",
  "uploadedAt": "2026-05-13",
  "alt": "Digital painting of a lit window at night",
  "mediaType": "image",
  "assetPath": "artwork/night-window-2026",
  "featured": true
}
```

The uploader stores image files in R2 at:

```text
artwork/{id}/thumb.webp
artwork/{id}/medium.webp
artwork/{id}/full.webp
```

Multi-page comics are image entries with a `pages` array:

```json
{
  "id": "comic-title",
  "title": "Comic Title",
  "gallery": "Main",
  "uploadedAt": "2026-05-13",
  "alt": "Comic title cover page",
  "mediaType": "image",
  "assetPath": "artwork/comic-title/pages/01",
  "pages": [
    { "assetPath": "artwork/comic-title/pages/01", "alt": "Comic title page 1" },
    { "assetPath": "artwork/comic-title/pages/02", "alt": "Comic title page 2" }
  ],
  "featured": false
}
```

Video entries use the same gallery metadata plus YouTube fields:

```json
{
  "id": "video-slug",
  "title": "Video Title",
  "gallery": "Main",
  "uploadedAt": "2026-05-13",
  "alt": "Video thumbnail description",
  "mediaType": "video",
  "videoProvider": "youtube",
  "youtubeId": "VIDEO_ID",
  "posterUrl": "",
  "featured": false
}
```

Set `"hidden": true` to hide an entry from the public site without deleting the R2 objects. The desktop uploader can add or remove this flag from Manage Posts.

Supported gallery values are `Main`, `Experimental`, and `NSFW`. Sorting on the website comes from the explicit `gallery` field in `gallery.json`.

The NSFW gallery is hidden behind an in-page warning and its images are not inserted into the DOM until the warning is accepted. This is a presentation safeguard, not real access control: public R2 delivery URLs remain public to anyone who has the URL.

## GitHub Pages Deployment

For the first test deployment:

1. Make `BokehCoyote/website_test` public.
2. Go to repository Settings -> Pages.
3. Set Source to `Deploy from a branch`.
4. Select branch `main` and folder `/root`.
5. Save and wait for the Pages deployment.

The expected project-site URL is:

```text
https://bokehcoyote.github.io/website_test/
```
