# Bokeh Coyote Gallery Test

Testing with Codex to see how the portfolio might work. This is a plain static GitHub Pages gallery for an art portfolio workflow with Cloudinary-hosted images and local JSON metadata.

## Local Preview

Run a static server from the repository root:

```sh
python3 -m http.server 4173
```

Open `http://localhost:4173/`. Do not use `file://`, because the site fetches `gallery.json`.

## Cloudinary Setup

1. Upload optimized artwork masters to Cloudinary.
2. Copy each Cloudinary public ID.
3. Replace `replace-with-your-cloud-name` in `assets/js/config.js`.
4. Replace or add entries in `gallery.json`.
5. Commit and push. GitHub Pages republishes the static site.

The site generates delivery URLs with `f_auto,q_auto`, thumbnail width limits, lazy loading, and larger detail images only after an artwork is opened.

## `gallery.json` Fields

Each artwork entry should use this shape:

```json
{
  "id": "night-window-2026",
  "title": "Night Window",
  "year": "2026",
  "medium": "Digital painting",
  "dimensions": "3000 x 2400 px",
  "category": "paintings",
  "status": "available",
  "alt": "Digital painting of a lit window at night",
  "cloudinaryPublicId": "portfolio/paintings/night-window-2026",
  "featured": true
}
```

Keep full artwork files out of GitHub. GitHub should store only the website files and metadata.

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
