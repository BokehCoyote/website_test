# Bokeh Gallery Hearts Worker

Cloudflare Worker backend for no-login heart buttons on the static gallery.

It uses one SQLite-backed Durable Object per artwork ID. Each object stores its own count and a 24-hour throttle keyed from a salted hash of IP, user agent, and artwork ID. The public site also remembers hearted artwork in `localStorage`, but the Worker is the real shared counter.

## Endpoints

- `GET /hearts?ids=id-a,id-b`
- `POST /hearts/:id`

## Deploy

1. Install Wrangler if needed:

   ```sh
   npm install -g wrangler
   ```

2. Copy the example config:

   ```sh
   cp wrangler.toml.example wrangler.toml
   ```

3. Set a salt secret:

   ```sh
   wrangler secret put IP_HASH_SALT
   ```

4. Deploy:

   ```sh
   wrangler deploy
   ```

5. Copy the deployed Worker URL and put it in `assets/js/config.js`:

   ```js
   window.PORTFOLIO_CONFIG = {
     cloudinaryCloudName: "dvv9rmejs",
     heartsApiUrl: "https://bokeh-gallery-hearts.<your-subdomain>.workers.dev/hearts"
   };
   ```

After that, commit `assets/js/config.js` and the static site will show live heart counts.

## Notes

- This is interaction, not accounts or favorites.
- It prevents easy repeat clicks, not determined abuse.
- Update `ALLOWED_ORIGINS` if the site URL changes.
