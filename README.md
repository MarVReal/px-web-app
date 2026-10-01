# px-web-app — Project-X frontend

Angular 21 (standalone components, signals, Reactive Forms, CDK drag & drop). Talks directly to Supabase; see `px-web-api` for the database.

## Run locally
```bash
npm install
npm start          # http://localhost:4200
```
`src/environments/environment.ts` holds the Supabase URL and **publishable** key (safe to expose). Never put a service-role key here.

## Deploy (Vercel)
1. Import this repo in Vercel (framework: Angular; `vercel.json` sets the build command, output dir and SPA rewrite).
2. Environment variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (the publishable key). `scripts/set-env.mjs` writes them into `environment.ts` at build time.
3. In Supabase → Auth → URL Configuration set the Site URL to your Vercel URL and add it (and `http://localhost:4200`) to Redirect URLs.

See `ROADMAP.md` for status, known issues and the deployment checklist.
