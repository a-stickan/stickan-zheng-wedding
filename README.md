# Aidan & Angela Wedding Website

Website for my wedding!

## Local Development

Run the static site:

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

## CI/CD

Pull requests run the Worker test suite and TypeScript check.

Merges to `main` automatically:

- push Supabase migrations
- deploy the Cloudflare RSVP Worker
- trigger the GitHub Pages deployment configured in the repository settings

Worker runtime secrets still live in Cloudflare and are not stored in this repository:

```sh
cd workers/rsvp
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_SECRET_KEY
npx wrangler secret put TURNSTILE_SECRET_KEY
npx wrangler secret put ALLOWED_ORIGINS
```

Do not edit a migration after it has been pushed. Create a follow-up migration instead.
