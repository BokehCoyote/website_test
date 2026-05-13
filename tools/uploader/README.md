# Bokeh Gallery Uploader

Local Electron uploader for the static GitHub Pages gallery.

The app generates WebP artwork variants, uploads them to Cloudflare R2 through the S3-compatible API, adds YouTube video metadata, creates or updates `gallery.json` entries, and commits the updated JSON to `BokehCoyote/website_test` through the GitHub Contents API.

## Security

Do not commit R2 secrets or GitHub tokens. This app stores settings in Electron's local app data directory on your machine. The website only receives the public R2 asset base URL.

Use a custom R2 domain for production. The public `r2.dev` URL is best treated as a temporary development placeholder.

## GitHub Token

Create a fine-grained GitHub personal access token for `BokehCoyote/website_test` with:

- Repository access: only `BokehCoyote/website_test`
- Permissions: Contents, Read and write

Paste that token into the app settings. The app uses GitHub's create-or-update file endpoint, which requires the current file SHA when updating `gallery.json`.

## Run

```sh
npm install
npm start
```

## Image Upload Flow

1. Open Settings and enter R2 and GitHub credentials.
2. Choose one local image, or select multiple ordered images for a comic.
3. Fill out the artwork metadata.
4. Click Upload and Commit.
5. GitHub Pages republishes after the commit lands on `main`.

The uploader writes `uploadedAt` automatically using the upload date. It creates `thumb.webp`, `medium.webp`, and `full.webp` for each image, preserving aspect ratio without upscaling.

Single-image uploads are saved under:

```text
artwork/{id}/thumb.webp
artwork/{id}/medium.webp
artwork/{id}/full.webp
```

Comic uploads are saved under:

```text
artwork/{id}/pages/01/thumb.webp
artwork/{id}/pages/01/medium.webp
artwork/{id}/pages/01/full.webp
```

## YouTube Video Flow

1. Upload the video to YouTube as public or unlisted.
2. Switch Post Type to YouTube Video.
3. Paste the YouTube URL or 11-character video ID.
4. Fill out title, gallery, alt text, and optional poster URL.
5. Click Add Video and Commit.

The website shows the poster or YouTube thumbnail in the gallery and loads the YouTube embed only when the post is opened.

## Manage Posts

Use Refresh in Manage Posts to load `gallery.json` newest first with image, comic, or video thumbnails. Hide marks an entry with `"hidden": true`, so the public site stops showing it. Restore removes that flag.

Edit changes a post title. For image and comic posts, optionally choose replacement image files; the app regenerates WebP variants and overwrites the post's current R2 object keys. If a replacement comic has fewer pages, obsolete old page keys are deleted from R2 after the JSON commit succeeds. For YouTube posts, Edit changes the YouTube URL or raw ID plus the optional poster URL.
