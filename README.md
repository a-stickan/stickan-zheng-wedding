# Angela & Aidan Wedding Website

Website for my wedding!

## Local Development

Run the static site:

```sh
npm run watch:css
```
```sh
python3 -m http.server 8000
```

Run the RSVP Worker:

```sh
cd workers/rsvp
npm run dev
```

Local RSVP requests use:

```text
http://127.0.0.1:8000 -> http://127.0.0.1:8787 -> Supabase
```

`workers/rsvp/.dev.vars` is required locally and must not be committed:

```sh
SUPABASE_URL=https://pzfalpvyndkmkesyuevl.supabase.co
SUPABASE_SECRET_KEY=your-supabase-secret-key
TURNSTILE_SECRET_KEY=1x0000000000000000000000000000000AA
ALLOWED_ORIGINS=http://127.0.0.1:8000
```

`config.js` contains only public browser config. For local testing it should point to the local Worker.

## Architecture

```text
Browser
  -> Cloudflare Worker
  -> Supabase api RPCs
  -> private Supabase tables
```

- `index.html`: page markup and RSVP form.
- `assets/js/app.js`: RSVP UI behavior and Worker API calls.
- `workers/rsvp/`: public RSVP API gateway.
- `supabase/migrations/`: database schema and RPC changes.

Supabase should expose only the `api` schema through the Data API. RSVP tables live in the `private` schema.
The 8-character RSVP code is a bearer secret: anyone with a group's code can view or edit that group's RSVP.

## Testing

Run the website browser tests locally:

```sh
npm run test:e2e
```

This builds `assets/css/site.css` from `assets/css/input.css`, starts the static site, and checks core page content, responsive photo disclosure behavior, and image references.

## CI/CD

Pull requests run the website Playwright tests, Worker test suite, and TypeScript check.

Merges to `main` automatically:

- Push Supabase migrations
  - Do not edit a migration after it has been pushed, create a follow-up migration instead
- Deploy the Cloudflare RSVP Worker
- Trigger the GitHub Pages deployment configured in the repository settings

