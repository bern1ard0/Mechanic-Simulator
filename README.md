# 🔧 Mechanic Simulator

A **private, password-protected** car app — just for you, made to open from your
phone. Three things in one place:

1. **My Garage** — every car you own or oversee (yours, your wife's, etc.), each
   with **multiple photos you can add and remove**, plus a **Looking to Buy** list
   for cars you're considering. You're the one car guy who manages it all; "owner"
   is just a label so you can tell whose car is whose.
2. **Diagnose** — describe a problem, pick the car, and get the likely cause, the
   parts and tools you'll need, and a YouTube video + manual to follow.
3. **Visual Studio** — realistic edits to a photo of your *actual* car (paint, wheels,
   tint, stance, real body parts). It refuses fantasy/unrealistic requests on purpose.

## Security & privacy

- **The whole site is behind one password.** First time you open it, you set the
  password; after that you sign in, and it remembers you on your phone.
- Passwords are stored only as a salted hash, never in plain text.
- Your cars, VINs, photos, and API keys live on your server's private disk and are
  **never** committed to GitHub. The private repo covers only the code.

---

## Putting it online (so you can use it from your phone)

This app is built to be hosted on a URL — you don't run anything locally. The
easiest path is **Render**, which deploys straight from this GitHub repo:

1. Go to **render.com**, sign in with GitHub.
2. **New → Blueprint**, pick this repo. Render reads `render.yaml` automatically.
3. When asked, set **`AUTH_PASSWORD`** to the password you want for the site.
4. Click **Apply**. In a couple of minutes you get a URL like
   `https://mechanic-simulator.onrender.com`.
5. Open that URL on your phone, sign in with your password. Done.

The `render.yaml` includes a **persistent disk**, so your cars and photos survive
restarts. (A persistent disk needs Render's paid instance, ~$7/month — that's the
trade-off for a private app that never forgets your garage.)

A `Dockerfile` is also included if you'd rather host on Fly.io, Railway, or a VPS.

### Settings / API keys

Open the app → **Settings** → paste your key(s) → **Save**. Stored only on your
server, never shown back, never pushed.

| Key | What it unlocks | Required? |
|-----|-----------------|-----------|
| Anthropic (Claude) | The real AI diagnosis (likely cause, parts, steps) | Recommended |
| YouTube | Pins a specific repair video instead of a search link | Optional |
| Higgsfield | Realistic car-photo edits | Optional |

**Never paste a key into a chat or commit it to the repo.** The Settings page is
the only place it should go.

---

## Running it on a computer (optional, for testing)

```bash
npm install
npm start          # then open http://localhost:3000
```

---

## Status

- ✅ Password-protected site (set-on-first-visit, signed session cookie)
- ✅ Garage: owned cars + owner labels + "Looking to Buy"
- ✅ Multiple photos per car (add / remove)
- ✅ Settings / key management (keys never returned to the browser)
- ✅ Diagnose (AI guidance when a Claude key is set; search links otherwise)
- ✅ Visual Studio realism guardrail + prompt builder
- ✅ Deploy config (Render blueprint + Dockerfile) with persistent storage
- ⏳ Visual Studio image generation (wiring the Higgsfield call) — next milestone
