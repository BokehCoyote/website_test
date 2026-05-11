# Bokeh Gallery Uploader

Local Electron uploader for the static GitHub Pages gallery.

The app uploads an optimized image master to Cloudinary, creates a `gallery.json` entry, and commits the updated JSON to `BokehCoyote/website_test` through the GitHub Contents API.

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

## Upload Flow

1. Open Settings and enter Cloudinary and GitHub credentials.
2. Choose an optimized local image.
3. Fill out the artwork metadata.
4. Click Upload and Commit.
5. GitHub Pages republishes after the commit lands on `main`.

The uploader writes `uploadedAt` automatically using the upload date. The `gallery` field controls site sorting. Cloudinary folders are only an organizational convenience.

## Manage Posts

Use Refresh in Manage Posts to load `gallery.json`. Hide marks an entry with `"hidden": true`, so the public site stops showing it. Restore removes that flag. Cloudinary assets are left untouched.
