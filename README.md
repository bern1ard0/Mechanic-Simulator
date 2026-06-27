# 🔧 Mechanic Simulator

A **private, password-protected** car app — just for you, made to open from your
phone. It runs entirely on **Cloudflare** (your own account), so it's ~free and
lives under your domain.

1. **My Garage** — every car you own or oversee (yours, your wife's, etc.), each
   with **multiple photos you can add and remove**, plus a **Looking to Buy** list
   for cars you're considering. You're the one car guy who manages it all; "owner"
   is just a label.
2. **Diagnose** — describe a problem, pick the car, and get the likely cause, the
   parts and tools you'll need, and a YouTube video + manual to follow.
3. **Visual Studio** — realistic edits to a photo of your *actual* car (paint, wheels,
   tint, stance, real body parts). It refuses fantasy/unrealistic requests on purpose.

## How it's built (all Cloudflare)

| Piece | Cloudflare service |
|------|---------------------|
| The app | **Workers** (`src/worker.js`, via Hono) |
| Cars / issues / settings | **D1** (SQLite database) |
| Car photos | **R2** (object storage) |
| The web page | **Workers static assets** (`public/`) |
| Login / security | **Cloudflare Access** (in front — emails you a one-time code) |

Login is handled by Cloudflare Access *before* a request reaches the app, so there's
no password to manage in code and nothing private is ever exposed.

---

## Going live on Cloudflare (one-time setup)

You don't write code. These are dashboard clicks plus a couple of commands I'll run
or hand you. Do them once and you're live at **garage.solemnarchitect.com**.

### 1. Create the storage (Cloudflare dashboard)
- **Workers & Pages → D1 → Create database**, name it **`mechanic_db`**. Copy its
  **Database ID**.
- **R2 → Create bucket**, name it **`mechanic-photos`**.

### 2. Drop in the Database ID
In `wrangler.toml`, replace `database_id = "local-dev-placeholder"` with the ID you
copied. (Tell me the ID and I'll commit this for you.)

### 3. Create the tables
In the dashboard: **D1 → mechanic_db → Console**, paste the contents of `schema.sql`,
run it. (Or, from a computer: `npm run db:init`.)

### 4. Deploy the app
Easiest from a phone: **Workers & Pages → Create → Connect to Git**, pick this repo.
Cloudflare reads `wrangler.toml`, builds, and deploys on every push.
(Or, from a computer: `npm run deploy`.)

### 5. Put it on your domain
On the Worker → **Settings → Domains & Routes → Add custom domain** →
`garage.solemnarchitect.com`. Cloudflare wires the DNS automatically since you own
the domain.

### 6. Lock it with Cloudflare Access (the login)
**Zero Trust → Access → Applications → Add → Self-hosted**, set the domain to
`garage.solemnarchitect.com`, and add a policy that allows **only your email**.
Now anyone visiting must prove they're you (Cloudflare emails a one-time code) before
the app even loads.

### 7. Add your API keys
Open the app → **Settings** → paste your key(s) → **Save**. Stored in your own D1,
never shown back, never pushed to GitHub.

| Key | What it unlocks | Required? |
|-----|-----------------|-----------|
| Anthropic (Claude) | The real AI diagnosis (likely cause, parts, steps) | Recommended |
| YouTube | Pins a specific repair video instead of a search link | Optional |
| Higgsfield | Realistic car-photo edits | Optional |

**Never paste a key into a chat or commit it to the repo.** The Settings page is the
only place it should go.

---

## Developing locally (optional)

```bash
npm install
npm run db:init:local     # create local tables
npm run dev               # http://localhost:8787 (D1 + R2 are simulated)
```

---

## Status

- ✅ All-Cloudflare: Workers + D1 + R2 + static assets
- ✅ Garage: owned cars + owner labels + "Looking to Buy"
- ✅ Multiple photos per car (add / remove), stored in R2
- ✅ Diagnose (AI guidance with a Claude key; search links otherwise)
- ✅ Visual Studio realism guardrail + prompt builder
- ✅ Login via Cloudflare Access (no homemade password)
- ⏳ Visual Studio image generation (wiring the Higgsfield call) — next milestone
