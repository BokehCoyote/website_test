# Bokeh Gallery Uploader

Local Electron uploader for the static GitHub Pages gallery.

The app uploads one or more optimized image masters to Cloudinary or adds YouTube video metadata, creates a `gallery.json` entry, and commits the updated JSON to `BokehCoyote/website_test` through the GitHub Contents API.

## Security

Do not commit API secrets or GitHub tokens. This app stores settings in Electron's local app data directory on your machine. The website never receives the Cloudinary API secret.

Because the Cloudinary secret was pasted into chat, rotate it in Cloudinary after testing if you want a clean secret.

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

1. Open Settings and enter Cloudinary and GitHub credentials.
2. Choose one optimized local image, or select multiple ordered images for a comic.
3. Fill out the artwork metadata.
4. Click Upload and Commit.
5. GitHub Pages republishes after the commit lands on `main`.

The uploader writes `uploadedAt` automatically using the upload date. The `gallery` field controls site sorting. Cloudinary folder settings are also sent during upload so assets land in the matching Main, Experimental, or NSFW folder. Multi-image uploads are saved as one post with a `pages` array and page-suffixed public IDs like `Main/comic-title-01`.

## YouTube Video Flow

1. Upload the video to YouTube as public or unlisted.
2. Switch Post Type to YouTube Video.
3. Paste the YouTube URL or 11-character video ID.
4. Fill out title, gallery, alt text, and optional poster URL.
5. Click Add Video and Commit.

The website shows the poster or YouTube thumbnail in the gallery and loads the YouTube embed only when the post is opened.

## Manage Posts

Use Refresh in Manage Posts to load `gallery.json` newest first with image, comic, or video thumbnails. Hide marks an entry with `"hidden": true`, so the public site stops showing it. Restore removes that flag.

Edit changes a post title and its source pointer. For image posts, enter one Cloudinary public ID. For comic posts, enter one Cloudinary public ID per line in page order. For YouTube posts, paste a YouTube URL or raw video ID, plus an optional poster URL. These edits only update `gallery.json`; Cloudinary assets and YouTube videos are left untouched.
