# Bokeh Coyote Gallery Test

Plain static GitHub Pages gallery for testing an art portfolio workflow with Cloudinary-hosted images, YouTube-hosted videos, and local JSON metadata.

## Local Preview

Run a static server from the repository root:

```sh
python3 -m http.server 4173
```

Open `http://localhost:4173/`. Do not use `file://`, because the site fetches `gallery.json`.

## Media Setup

1. Upload optimized artwork masters to Cloudinary.
2. Copy each Cloudinary public ID.
3. Replace `replace-with-your-cloud-name` in `assets/js/config.js`.
4. For videos, upload to YouTube as public or unlisted and copy the video URL or ID.
5. Replace or add entries in `gallery.json`.
6. Commit and push. GitHub Pages republishes the static site.

The site generates delivery URLs with `f_auto,q_auto`, thumbnail width limits, lazy loading, and larger detail images only after an artwork is opened.

YouTube posts render a thumbnail in the gallery and load the `youtube-nocookie.com` embed only when the post is opened.

## Heart Buttons

The gallery can show no-login heart buttons backed by a Cloudflare Worker. The static site code is already wired for it; hearts stay disabled until `heartsApiUrl` is set in `assets/js/config.js`.

Worker files live in `cloudflare/hearts-worker`. Deploy that Worker with Wrangler, then set:

```js
window.PORTFOLIO_CONFIG = {
  cloudinaryCloudName: "dvv9rmejs",
  heartsApiUrl: "https://bokeh-gallery-hearts.<your-subdomain>.workers.dev/hearts"
};
```

The Worker uses SQLite-backed Durable Objects for strongly consistent per-artwork counts and a 24-hour hashed-client throttle. It is not login, favorites, or strict anti-abuse; it is lightweight public interaction.

## Desktop Uploader

An experimental local Electron uploader lives in `tools/uploader`. It uploads a selected local image to Cloudinary or adds YouTube video metadata, appends an entry to `gallery.json`, and commits the JSON change back to GitHub.

Run it from Finder by double-clicking `Open Gallery Uploader.command`, or run it locally:

```sh
cd tools/uploader
npm install
npm start
```

The uploader stores Cloudinary and GitHub credentials in Electron's local app data directory on your machine. Do not commit API secrets or GitHub tokens. The GitHub token should be a fine-grained personal access token scoped to this repository with Contents read/write access.

## `gallery.json` Fields

Image entries should use this shape:

```json
{
  "id": "night-window-2026",
  "title": "Night Window",
  "gallery": "Main",
  "uploadedAt": "2026-05-11",
  "alt": "Digital painting of a lit window at night",
  "cloudinaryPublicId": "portfolio/paintings/night-window-2026",
  "featured": true
}
```

Keep full artwork files out of GitHub. GitHub should store only the website files and metadata.

Video entries use the same gallery metadata plus YouTube fields:

```json
{
  "id": "video-slug",
  "title": "Video Title",
  "gallery": "Main",
  "uploadedAt": "2026-05-12",
  "alt": "Video thumbnail description",
  "mediaType": "video",
  "videoProvider": "youtube",
  "youtubeId": "VIDEO_ID",
  "posterUrl": "",
  "featured": false
}
```

Existing image entries do not need `"mediaType"`; the site treats missing media type as `"image"`.

Set `"hidden": true` to hide an entry from the public site without deleting the Cloudinary asset. The desktop uploader can add or remove this flag from Manage Posts.

Supported gallery values are `Main`, `Experimental`, and `NSFW`. Cloudinary folders can mirror those names for organization, but sorting on the website comes from the explicit `gallery` field in `gallery.json`.

The NSFW gallery is hidden behind an in-page warning and its images are not inserted into the DOM until the warning is accepted. This is a presentation safeguard, not real access control: public Cloudinary delivery URLs remain public to anyone who has the URL.

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
