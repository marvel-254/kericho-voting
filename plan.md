# Kericho Primary Online Voting Management System

**Project report file:** `Kericho_Primary_Voting_System_Project.docx`
**Author:** Sharon Chepkirui · **Supervisor:** Grofry Rotich
**Institution:** Kenya Highlands University — School of Computing & Information Science (BSc IT)
**Date:** July 2026

## What the report covers
A complete BSc IT final-year project report for a browser-based online voting system
for Kericho Primary School pupil-leadership elections. Document is complete and
internally consistent (5 chapters + front matter + references).

## The system being described
A lightweight, browser-based online voting web app. Pupils log in with admission
number + PIN and cast one ballot; an authenticated admin sees live results,
percentages and turnout, and can reset data.

### Leadership positions (5)
1. School Captain (Head Boy)
2. School Captain (Head Girl)
3. Assistant Head Boy
4. Assistant Head Girl
5. Games Captain

### Modules
- **Authentication** — admission number + PIN login; rejects repeat voters
- **Ballot** — all positions on one screen; must pick exactly one per position
- **Tallying** — increments vote counts; marks pupil as voted (no altering once cast)
- **Admin Dashboard** — separate admin login; live counts, %, turnout; data reset

### Database entities
- **Voters**: AdmissionNumber (PK), PIN, Name, Class, HasVoted
- **Candidates**: CandidateID (PK), Position, Name, Class
- **Votes**: CandidateID (FK), VoteCount

### Theme / methodology
- **Methodology:** Rapid Application Development (RAD)
- **Tools:** HTML5, CSS3, JavaScript, key-value data storage, MS Word docs

## Testing documented in report
- Unit tests (tallying/% logic) — passed
- System tests TC01–TC07 (login, double-vote rejection, incomplete ballot, reset) — passed
- UAT with 10 pupils + 1 teacher — passed
- Sample result: Head Boy — Brian Kiplangat 6/60% vs Dennis Cheruiyot 4/40%

## STATUS: DECIDED — build the actual working system (simple + functional)

Direction confirmed: build a real, working online voting system.
Goal: SIMPLICITY first — only the features in the report, nothing extra.

### Chosen architecture (zero external dependencies)
- **Server:** Node.js (v24 built-in `http` + `node:sqlite` — no npm install)
- **Client:** one HTML page (HTML/CSS/JS) served by the server
- **Storage:** SQLite file (`voting.db`) — survives restarts, shared across machines
- **Deployment:** one lab machine runs the server; all browsers on the LAN connect to it
- Built-in `node:sqlite` means no `npm install` — fully self-contained

### Files to create (in ~/Documents/voting/)
- `server.js` — Node web server + API + SQLite logic (single file)
- `public/index.html` + `public/style.css` + `public/app.js` — the client
- `seed.js` or a seed block — sample voters, candidates, admin account
- `voting.db` — created automatically on first run

### Scope (exact features — NO extras)
Pupil side:
1. Login with admission number + PIN
2. Ballot shows all 5 positions; must pick exactly 1 per position
3. Submit once — double voting blocked (permanent)

Admin side:
1. Login separately (admin credentials, not a pupil account)
2. Dashboard: live counts + % per candidate, overall turnout %
3. Reset election data (clears votes + has-voted flags)

Data:
- Seed voters (admission + PIN + name + class) and candidates (position + name + class)
- PINs hashed (not stored plaintext)

### API endpoints
- `POST /api/login` — pupil login, returns ballot + session
- `POST /api/vote` — submit ballot (rejects incomplete or second vote)
- `POST /api/admin/login` — admin login
- `GET  /api/results` — live counts, %, turnout (admin only)
- `POST /api/reset` — reset election (admin only)

### Testing plan (mirror the report's TC01–TC07)
- TC01 login OK → ballot screen
- TC02 wrong PIN rejected
- TC03 double vote rejected
- TC04 incomplete ballot rejected
- TC05 valid ballot → tallies + % update
- TC06 admin login → dashboard
- TC07 reset → counts back to zero
Also: totals sum to 100%, % math correct vs hand-recount.

### Build order
1. DB schema + seed (voters, candidates, admin)
2. Server + auth + ballot + vote endpoints
3. Client page (login → ballot → confirmation)
4. Admin dashboard (results, turnout, reset)
5. Test against TC01–TC07, then hand it over

### Notes
- Password `marvelx` (sudo) on blacksite.
- This plan.md is a working file — update as the project progresses.

## HOSTING (thinking — for a client demo)
"Show to the client" — system is a single Node server + SQLite file, easy to put almost anywhere.

### Path A — Local demo (client on the LAN / in the lab)
- Run server on host machine; client opens `http://<host-ip>:3000` in a browser.
- Pros: free, zero upload, fully offline, private. Best when client is physically there.
- Cons: only works on the same network; not shareable remotely.

### Path B — Quick temporary public link (tunnel from local machine)
- `cloudflared tunnel --url http://localhost:3000` (free, no account) → instant https URL
  or `ngrok http 3000` (free tier, needs account).
- Pros: 30-second setup, shows the real running app to a remote client, no deploy.
- Cons: URL is temporary; machine must stay on; not a "real" deployment.

### Path C — Free cloud web deploy (persistent shareable link)
- **Render** (free web service), **Railway**, **Glitch**, or **Fly.io** — deploy the Node app.
- Pros: a stable link the client can open anytime/anywhere; looks like a real product.
- Cons: free-tier disk is sometimes ephemeral → SQLite resets on restart/redeploy (fine for
  a demo — just re-seed); small cold-start delay on free tiers.

### Recommendation (for "just to show the client")
- If the client will be **physically present / on the LAN** → Path A (simplest, most reliable).
- If they need a **link from anywhere**, choose:
  - fastest, zero-upload demo → Path B (cloudflared quick tunnel)
  - a **persistent demo link** they can open any time → Path C (Render free tier)
- Note: whichever we pick, the code is identical — no rework needed to switch.

### Decision (pending)
- [x] Hosting target chosen: **Render** (free tier) — see `hosting.md` for the full plan.
- [ ] Client on-site (LAN) vs remote (link) — Local LAN still an option alongside Render.

## Notes
- Password `marvelx` (sudo) on blacksite.
- This plan.md is a working file — update as the project progresses.
