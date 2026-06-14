# MakeTabs — Dos & Don'ts (hard-won lessons)

Practical rules for working on this project safely. Most were learned the hard
way during the 2026-06-14 chiptune work, where a batch of well-intentioned
changes broke a mix the user was happy with. Read this before touching the
chiptune pipeline or deploying.

## Deployment

- **DO remember there are TWO services**, both of which COPY code into their
  image (no bind mount): `maketabs-backend` (FastAPI) and `maketabs-frontend`
  (React build served by nginx). Compose: `docker/compose/maketabs.yml`.
- **DO rebuild the service whose code you changed.** Anything under `frontend/`
  (incl. `ChiptunePlayer.tsx` — playback, channels, gains, mute defaults) only
  takes effect after rebuilding **`maketabs-frontend`**. Rebuilding only the
  backend leaves player changes invisible.
  ```bash
  docker compose -f docker/compose/maketabs.yml build maketabs-backend maketabs-frontend
  docker compose -f docker/compose/maketabs.yml up -d --force-recreate maketabs-backend maketabs-frontend
  ```
- **DO bump `CURRENT_ALGORITHM`** (`backend/app/services/chiptune_pipeline.py`)
  whenever you change chiptune **output** logic — **including the Songsterr
  converter `songsterr_to_chiptune.py`**, not just the ML pipeline.
  `routes/chiptune.py` only regenerates a stored job when
  `job.algorithm_version != CURRENT_ALGORITHM`. Forget the bump and you'll see
  "nothing changed" because the cached job is served.
- **DO verify the deploy actually landed** before drawing conclusions: check the
  served JS bundle hash / contents and the backend's running `CURRENT_ALGORITHM`
  (`docker exec maketabs-backend python -c "from app.services.chiptune_pipeline import CURRENT_ALGORITHM; print(CURRENT_ALGORITHM)"`).
- **DON'T conclude "my change didn't work"** until you've confirmed it is both
  deployed (right service rebuilt) and, for audio, actually heard.
- **DON'T refresh a `/chiptune/<id>` or `/tab/<id>` URL directly** — nginx
  proxies those paths to the backend API, so you get raw JSON. It's a known
  path collision between SPA routes and API routes. Navigate from the root
  (`tabs.paisbru.com`) instead.

## Change discipline

- **DO make ONE change at a time**, deploy it, have the user listen, *then*
  decide the next step. Audio quality is subjective and can't be verified from
  the server.
- **DO keep changes minimal and additive** when the user is happy with the
  current state. Adding an opt-in voice is safe; rewriting the existing mix is
  not.
- **DON'T batch multiple experimental changes into one deploy.** When the result
  is worse you can't tell which change caused it, and you can wreck a good
  baseline in one shot. (This is exactly what went wrong: 32nd-note grid +
  looser detection + a new lead channel + drums-on were deployed together and
  made songs unrecognizable.)
- **DON'T pile changes onto a pipeline the user calls "good" / "almost
  perfect."** The core mix is **melody (vocals) + harmony (rhythm) + bass**.
  Preserve it byte-for-byte unless explicitly asked to change it.
- **DON'T enable drums or any new voice by default.** New voices are opt-in via
  their mute toggle.

## Chiptune model facts (so you don't relearn them)

- chiptune_data has 3 tonal channels + drums: `melody` (square, = vocals),
  `harmony` (sawtooth, = rhythm guitar), `bass` (triangle), `drums` (noise).
- With vocals present there is **no spare channel** for a lead-guitar solo or
  piano: during sung sections all three tonal voices are occupied. The original
  pipeline folds an instrumental-section solo *into* the harmony channel, where
  it tends to get buried under the rhythm.
- Songsterr path is tried first (human-transcribed); ML (Demucs + basic-pitch)
  is the fallback. Demucs gives ONE mixed guitar stem — you cannot split lead
  from rhythm within it.

## Safety / rollback

- **`main` is the live, known-good state.** Do experimental work on a branch and
  never merge/deploy it without explicit user approval.
- **DO roll back fast if production breaks:** `git checkout main`, rebuild both
  images, force-recreate both containers. (Stored jobs auto-regenerate on next
  view because their algorithm_version no longer matches.)
- The `feat/chiptune-32nd-resolution` branch is **reference only** — it bundled
  the changes that broke the mix. Do not redeploy it. Re-introduce any single
  idea from it only on request, one at a time, with the user listening.
