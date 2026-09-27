# Accuracy — where it actually comes from, and how to improve it

Written 2026-09-27 against the production database and the live Songsterr API.
Everything with a number in it was measured, not estimated; the method is given
so you can re-run it.

Read [DOS_AND_DONTS.md](DOS_AND_DONTS.md) first. The rule that matters most
here: **one change at a time, deployed and listened to on its own.** Most of
this document is options, not a plan.

---

## 1. What the data says

Measured with (role `admin`, shared `postgres` container):

```bash
docker exec postgres psql -U admin -d maketabs -c \
  "select algorithm_version, source, count(*) from tab_generations group by 1,2 order by 1,2;"
```

| | Songsterr | ML |
|---|---|---|
| Tab generations, all time | 53 | 64 |
| Tab generations since the Songsterr path landed (algo ≥ 4.0.0) | 49 | **1** |
| Chiptune generations, all time | 116 | **1** |

41 tracks in the library; 117 tab generations and 117 chiptune generations,
because a stored job regenerates whenever `algorithm_version != CURRENT_ALGORITHM`.

**All 64 ML tabs are from algorithm versions 1.0.0–3.4.0, i.e. from before the
Songsterr path existed** (it landed at 4.0.0). Every tab generated since
2026-06 is Songsterr. The 14 songs that appear under both sources are simply
old ML rows that were later regenerated through Songsterr.

### The headline

> **Exactly one song in the whole library genuinely falls back to ML** — for
> both products, at current algorithm versions:
> **Sin Animo De Lucro — "Solo por Tenerte - Acústica"**.

Three tracks still *show* `source = ml` as their newest row
(Metallica "One (Remastered)", Plain White T's "Hey There Delilah", and the
above). The first two are stale pre-4.0.0 rows that nobody has opened since;
their `algorithm_version` no longer matches, so **they will regenerate through
Songsterr the moment anyone views them**. That is the cache design working, not
a bug. I verified both songs fetch cleanly from Songsterr today.

### What this means for where to spend effort

Improving the ML transcription models would improve **one song**. It is still
worth doing eventually — it is the only path for anything Songsterr lacks, and
the library is 41 songs of mostly well-covered rock and punk, which is the best
case for Songsterr coverage. But it is not where the leverage is today.

**The leverage is in the Songsterr path**: which song entry gets picked, which
of its tracks become which voice, and what happens when a fetch fails.

---

## 2. The one real bug I found

`SongsterrClient.pick_best_match()` returns **a single candidate**. If that
candidate's tab page is missing, `_try_songsterr()` / `_try_songsterr_chiptune()`
catch the exception and drop straight to ML — the other seven search results are
never tried.

This is exactly what happens to the one ML song. Traced live against the API:

```
Sin Animo De Lucro — Solo por Tenerte
  search            → 8 results
  pick_best_match   → songId 247127 'Solo Por Tenerte'
  get_state_meta    → SongsterrNotFound: Tab page returned 404 for songId 247127
  → falls back to ML
```

For comparison, the same trace on songs that work:

```
Metallica — One (Remastered)   → songId 511145, 14 tracks, 10 guitars, 14/14 parts OK
Plain White T's — Hey There…   → songId 133,    6 tracks,  1 guitar,   6/6  parts OK
Green Day — Boulevard…         → songId 92866,  9 tracks,  4 guitars,  9/9  parts OK
```

**Fix:** have `pick_best_match` return a *ranked list*, and have the callers walk
it until one candidate yields usable tracks. Small, contained, and it very
likely takes the library to 100% human-transcribed.

### Two hypotheses I tested and discarded

Recording these so nobody re-derives them:

- **"Spotify title suffixes break the search."** They don't. Songsterr's search
  is fuzzy enough: `"One (Remastered)"`, `"Hotel California - 2013 Remaster"`
  and `"Solo por Tenerte - Acústica"` all return a correct match raw. Cleaning
  the query changes *which* entry ranks first (`'One - Remastered and Revisited'`
  vs `'One'`) but not whether a match is found. Worth doing for entry quality,
  not for hit rate.
- **"The Songsterr lookup is flaky."** It isn't. The both-sources songs are
  explained entirely by the 4.0.0 cutover, not by intermittent failures.

---

## 3. Options

Ordered by value for *this* library. Each is independently shippable.

### Tier 0 — the Songsterr path (highest value, lowest risk)

**0.1 — Walk the candidate list.** *(the bug above)*
Return ranked candidates from `pick_best_match`; try each until one gives
non-empty tracks. ~30 lines in `songsterr_client.py` + both callers.
*Verify:* the Solo por Tenerte job produces `source = songsterr`.
*Risk:* very low. Strictly more likely to find a tab than today.

**0.2 — Rank candidates better.** Today's score is
`artist_match*2 + title_match*2 + has_guitar`, which ties constantly across 8
results and then takes whichever Songsterr returned first. Add: prefer an exact
normalised title over a substring; prefer more non-empty tracks; prefer entries
that have a vocal track (the chiptune melody source); penalise titles
containing `live`, `acoustic`, `cover`, `remix` unless the query asked for them.
*Verify:* re-run the probe across all 41 tracks and diff the chosen `songId`.
*Risk:* low, but it changes which tab you get for songs that currently work —
bump `CURRENT_ALGORITHM` and spot-check a few favourites.

**0.3 — Record why the fallback happened.** Both paths swallow broad
`Exception` → log a warning → return `None`. Nothing in the DB says whether ML
was used because Songsterr genuinely lacks the song or because a CDN request
failed. Add a `fallback_reason` column (or a key in `chiptune_data`).
*Value:* this whole document took an afternoon of probing that one column would
have answered instantly.
*Risk:* none, additive.

**0.4 — Re-attempt Songsterr for ML-sourced rows.** An ML result is cached like
a final answer. If Songsterr was down that minute, the song is stuck on the
worse transcription until the algorithm version happens to change. Treat
`source = ml` as provisional: on view, if the row is older than N days, retry
Songsterr once before serving.
*Risk:* low; costs one search request per stale view.

**0.5 — Resume jobs killed by a container restart.** 7 of the 10 historical tab
failures are `Job interrupted by server restart` / `orphaned by container
restart`. Not accuracy, but it is the largest single failure bucket. On startup,
mark `processing` jobs as `pending` and requeue.
*Risk:* low. Needs care not to requeue infinitely.

### Tier 1 — Songsterr → voices (chiptune quality)

This is where chiptune *musicality* is now decided, since 116/117 chiptunes come
from Songsterr. Metallica's "One" exposes 14 tracks; which ones become melody,
harmony, lead and bass is `songsterr_to_chiptune.py`'s job.

**1.1 — Better track selection.** Currently every non-empty track is fetched and
the converter decides. With 10 guitar tracks the choice of which becomes
"harmony" is close to arbitrary. Use Songsterr's own `default_track` and
`popular_track_guitar` hints (already parsed into `SongsterrSong`, currently
unused by the chiptune path) as tie-breakers.
*Risk:* **medium — this changes the mix.** Exactly the kind of change
DOS_AND_DONTS says to ship alone and listen to. Bump `CURRENT_ALGORITHM`.

**1.2 — Keep velocity.** Songsterr notes carry dynamics; the player applies a
fixed gain per channel (`buildTonalTimeline`, `gainLevel`). Passing velocity
through would give the chiptune phrasing instead of a flat wall.
*Risk:* medium — it is audible on every song. Ship alone.

**1.3 — Per-instrument mixing UI.** Listed as not-done in the README. Now that
each channel button carries its waveform sprite, adding a gain slider per
channel is a natural extension and costs nothing in the pipeline.
*Risk:* none to the pipeline; frontend-only.

### Tier 2 — ML transcription (only affects songs Songsterr lacks)

Worth doing when coverage matters more than it does today.

**2.1 — Monophonic pitch tracking for melody and bass.** `basic-pitch` is a
*polyphonic* model being used on monophonic material (isolated vocals, isolated
bass), where it reliably adds octave and harmonic ghosts — which is why
`_transcribe_tonal` needs the `melodic=True` contour hack to clean up after it.
A dedicated f0 tracker (CREPE, or `librosa.pyin` which is already a dependency)
plus note segmentation would be materially more accurate for those two channels
and leave harmony on basic-pitch where polyphony is real.
*Cost:* pyin is free (librosa is installed); CREPE adds a ~1 GB model.
*Risk:* contained — two channels, and the ML path is one song today.

**2.2 — Key estimation and out-of-key suppression.** Wrong notes are what make
a chiptune sound broken. Estimate the key (Krumhansl profile over the
transcribed pitch histogram — no new dependency) and drop or snap low-confidence
notes outside it.
*Risk:* low, and cheap to A/B.

**2.3 — Melody contour clamp.** Limit interval jumps > 12 semitones unless the
note is long and confident. Kills the octave-flip artefact directly.

**2.4 — Tuning and capo detection (tabs).** `_OPEN_MIDI` in `audio_pipeline.py`
hardcodes standard E. Drop-D, Eb and drop-C are everywhere in this library's
genres, and on those songs every fret number in an ML tab is wrong. Estimate
tuning from the pitch histogram of the bass and guitar stems before assigning
frets. *(The Songsterr path already honours tuning and capo — algo 5.1.1 — so
this is ML-path only.)*
*Risk:* low, high payoff per affected song.

**2.5 — Better separation.** `htdemucs_6s` (2022) is the weakest link before
transcription. `htdemucs_ft` is a drop-in with better quality at ~4× the time;
Mel-Band Roformer models are materially better again for vocals.
**Hard constraint:** the GPU is an **RTX 3060 Laptop with 6 GB VRAM** and the
backend container is capped at 8 GB. That rules out the largest Roformers and
MT3; `htdemucs_ft` and the smaller Roformers with chunked segments do fit.
*Risk:* medium — changes every ML stem, and Demucs already timed out at 900 s
once in the failure log. Raise the timeout with it.

**2.6 — Guitar-specific transcription (tabs).** TabCNN / FretNet predict string
and fret directly from audio rather than going pitch → `_assign_positions`.
That is the actual tab problem rather than an approximation of it. Research-grade
code, so treat as an experiment.

**2.7 — Drum transcription.** `_detect_drums` is band-split onset detection —
crude, and it over-triggers hi-hats. A trained ADT model (`madmom`) would be
better. Low priority: drums are opt-in and off by default.

### Tier 3 — coverage

**3.1 — Accept user-supplied Guitar Pro / MIDI upload.** For anything Songsterr
lacks, let the user drop in a `.gp5`/`.gpx`/`.mid` and run it through the same
converter the Songsterr path uses. Sidesteps ML entirely and gives a perfect
result. Probably the single best answer to "Songsterr doesn't have my song".

**3.2 — A second human-transcription source.** Ultimate Guitar has no usable
API and its tabs are plain text (no timing), so it helps tabs but not chiptunes.
MuseScore has timing but licensing is murky. Lower value than 3.1.

---

## 4. Suggested sequence

Respecting one-change-at-a-time:

1. **0.1** candidate fallback — likely takes the library to 100% Songsterr.
2. **0.3** record the fallback reason — makes everything after this measurable.
3. **0.5** requeue interrupted jobs — clears the largest failure bucket.
4. **0.2** better candidate ranking — bump the algorithm version, spot-check.
5. Then stop and listen. If chiptunes still feel off, the cause is **1.1/1.2**
   (Songsterr → voices), not the ML models.
6. Tier 2 only when you hit songs Songsterr doesn't have, or **3.1** instead.

---

## 5. A landmine

`chiptune_generations` contains **3 rows at `algorithm_version = 2.8.0`**, while
`CURRENT_ALGORITHM` in the code is `2.5.1`. Those rows are leftovers from the
reverted `feat/chiptune-32nd-resolution` experiment — the one DOS_AND_DONTS
records as having wrecked the mix.

They are harmless today because `2.8.0 != 2.5.1` means they regenerate on view.
**But if the chiptune algorithm version is ever bumped to 2.8.0, those three
rows will be served as current** and you will hear the broken mix again with no
obvious cause. Either delete them, or never reuse that version number:

```bash
docker exec postgres psql -U admin -d maketabs -c \
  "delete from chiptune_generations where algorithm_version = '2.8.0';"
```
