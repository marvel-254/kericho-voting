# Hosting Plan — Deploying the Voting System on Render

Target: host the whole voting system on **Render** (free tier) for a persistent,
shareable client demo link. The app is a single Node.js server + SQLite file, so
it deploys cleanly with no external services.

## Why Render
- Free web service tier is enough for a lightweight demo.
- Trivial Node deploy: give it a repo + a start command.
- Gives a stable public URL like `https://voting-xxxx.onrender.com`.
- No credit card needed for the free tier.

## What we need beforehand
1. A **Git repository** for the project (Render deploys from a repo branch — GitHub/GitLab).
2. The project structured with `server.js` and a `package.json` at the repo root.

## Step 1 — Prepare the repo
```bash
cd ~/Documents/voting
# a minimal package.json so Render knows it's a Node app
```
package.json (minimal):
```json
{
  "name": "kericho-voting",
  "version": "1.0.0",
  "type": "module",
  "scripts": { "start": "node server.js" }
}
```
- No dependencies (Node built-ins only) → `npm install` succeeds trivially.
- Add a `.gitignore` so the SQLite db & node_modules are NOT committed:
```gitignore
voting.db
voting.db-journal
node_modules/
```
```bash
git init && git add . && git commit -m "voting system"
```

## Step 2 — Make the server Render-aware
- Render injects a `PORT` env var → server must listen on `process.env.PORT`
  (fallback to 3000 locally).
```js
const port = process.env.PORT || 3000;
server.listen(port);
```

## Step 3 — Push to GitHub
```bash
git remote add origin https://github.com/<you>/kericho-voting.git
git push -u origin main
```

## Step 4 — Create the Render web service
1. Log in at render.com (free account).
2. **New + → Web Service**.
3. Connect the GitHub repo.
4. Fill in:
   - **Name:** e.g. `kericho-voting`
   - **Region:** closest to you (e.g. Frankfurt / Oregon)
   - **Root Directory:** leave default (repo root where package.json is)
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. **Create Web Service.** It deploys automatically; Render gives you a URL.

## Step 5 — Seed data on the free tier
- Free-tier disk is **ephemeral**: `voting.db` resets on restart/redeploy.
- Fix for a demo: have the server **auto-seed** the DB on first boot when empty
  (a `seedIfEmpty()` call in server.js). No manual steps after every deploy.
- Note: for a demo that's fine. If we later need real persistence, options are:
  - Render **Persistent Disk** (paid), or
  - switch storage to a managed Postgres (e.g. **Neon** free tier) — more moving parts,
    not needed for a demo.

## Optional — Blueprint (reproducible infra) render.yaml
```yaml
services:
  - type: web
    name: kericho-voting
    runtime: node
    plan: free
    buildCommand: npm install
    startCommand: node server.js
    envVars:
      - key: NODE_VERSION
        value: 24
```
This lets us recreate the service from the repo instead of clicking through the
dashboard.

## On Render it will be
- Public URL: `https://kericho-voting.onrender.com` (auto-generated name)
- Anyone with the link can open the login page → good for showing the client.

## Checklist
- [ ] Write `package.json` + `.gitignore`
- [ ] Make server read `process.env.PORT`
- [ ] Add `seedIfEmpty()` auto-seed
- [ ] `git init`, commit, push to GitHub
- [ ] Create Render web service (dashboard or render.yaml)
- [ ] Open the .onrender.com URL from another network → confirm it loads
- [ ] Confirm login → ballot → vote → admin dashboard all work on the hosted URL

## Trade-offs recap
- Free + simple, one codebase identical to local/LAN/glitch paths.
- Free-tier cold start (a few seconds) and ephemeral DB are acceptable for a demo.
- If the client later needs a persistent, always-on real election: move to a paid
  Render instance (Persistent Disk) or add a managed Postgres.

## Notes
- This file lives at ~/Documents/voting/hosting.md
- Password `marvelx` (sudo) on blacksite.
