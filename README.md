# 🔧 Mechanic Simulator

A **private, personal** car app — just for you. Three things in one place:

1. **My Garage** — every car you own or oversee (yours, your wife's, etc.), plus a
   **Looking to Buy** list for cars you're considering. You're the one car guy who
   manages it all; "owner" is just a label so you can tell whose car is whose.
2. **Diagnose** — describe a problem, pick the car, and get the likely cause, the
   parts and tools you'll need, and a YouTube video + manual to follow.
3. **Visual Studio** — realistic edits to a photo of your *actual* car (paint, wheels,
   tint, stance, real body parts). It refuses fantasy/unrealistic requests on purpose.

Everything stays on your computer. Your cars, photos, VINs, and keys are never
pushed to GitHub and never shared.

---

## Running it (one time setup)

You don't need to code. Two commands:

```bash
npm install      # downloads what the app needs (first time only)
npm start        # starts the app
```

Then open **http://localhost:3000** in your browser.

To stop it, press `Ctrl + C` in the terminal.

---

## Adding your keys

Open the app → **Settings** tab → paste your key(s) → **Save**. That's it.
Keys are stored only on your machine (in `data/db.json`, which is never pushed).

| Key | What it unlocks | Required? |
|-----|-----------------|-----------|
| Anthropic (Claude) | The real AI diagnosis (likely cause, parts, steps) | Recommended |
| YouTube | Pins a specific repair video instead of a search link | Optional |
| Higgsfield | Realistic car-photo edits | Optional |

Without any keys the app still runs — Diagnose falls back to giving you good
search links instead of a full AI diagnosis.

**Never paste a key into a chat or commit it to the repo.** The app's Settings
page is the only place it should go.

---

## What's private, and how

| Thing | Where it lives | Pushed to GitHub? |
|-------|----------------|-------------------|
| The code | this repo | yes (private repo) |
| Your cars / VIN / photos | `data/` on your machine | **no** (gitignored) |
| Your API keys | `data/db.json` on your machine | **no** (gitignored) |

---

## Status

- ✅ Garage (owned + owner labels + "Looking to Buy")
- ✅ Settings / key management
- ✅ Diagnose (AI guidance when a Claude key is set; search links otherwise)
- ✅ Visual Studio realism guardrail + prompt builder
- ⏳ Visual Studio image generation (wiring the Higgsfield call) — next milestone
- ⏳ Optional private hosting with a password — later
