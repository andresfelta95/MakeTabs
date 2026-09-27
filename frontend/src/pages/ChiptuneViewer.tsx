import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import ChiptunePlayer from "../components/ChiptunePlayer";
import StepRack from "../components/StepRack";
import PixelSprite from "../components/PixelSprite";
import { SPRITES } from "../lib/sprites";
import { useChiptuneJob } from "../hooks/useSpotify";
import { generateChiptune } from "../api/spotify";

const STEPS = [
  { key: "downloading",  label: "Downloading audio" },
  { key: "separating",   label: "Separating stems" },
  { key: "analyzing",    label: "Analyzing tempo" },
  { key: "transcribing", label: "Transcribing instruments" },
  { key: "building",     label: "Building chiptune" },
];

export default function ChiptuneViewer() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate  = useNavigate();
  const { data: job, isLoading } = useChiptuneJob(jobId ?? null);
  const [regenerating, setRegenerating] = useState(false);

  async function handleRegenerate() {
    if (!job?.track?.spotify_id || regenerating) return;
    setRegenerating(true);
    try {
      const newJob = await generateChiptune(job.track.spotify_id, true);
      navigate(`/chiptune/${newJob.job_id}`, { replace: true });
    } finally {
      setRegenerating(false);
    }
  }

  if (isLoading || !job) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <PixelSprite sprite={SPRITES.cart} className="h-10 w-10 text-chip pix-bob" />
          <span className="font-pixel text-[9px] text-secondary">Loading…</span>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-secondary hover:text-primary mb-6 flex items-center gap-2 transition-colors"
      >
        ← Back
      </button>

      {/* Track header */}
      {job.track && (
        <div className="mb-6 flex items-center gap-4">
          {job.track.image_url && (
            <img src={job.track.image_url} alt="" className="pixelated h-16 w-16 object-cover saturate-[0.6]" />
          )}
          <div className="min-w-0">
            <h2 className="truncate text-xl font-bold text-primary">{job.track.title}</h2>
            <p className="truncate text-secondary">{job.track.artist}</p>
          </div>
          <span className="ml-auto flex shrink-0 items-center gap-1.5 border border-chip/40 bg-chip/10 px-2 py-1 font-pixel text-[8px] text-chip">
            <PixelSprite sprite={SPRITES.cart} className="h-3.5 w-3.5" />
            16-bit
          </span>
        </div>
      )}

      {(job.status === "pending" || job.status === "processing") && (
        <StepRack steps={STEPS} status={job.status} currentStep={job.current_step} accent="chip" />
      )}

      {job.status === "failed" && (
        <div className="space-y-4">
          <StepRack
            steps={STEPS}
            status={job.status}
            currentStep={job.current_step}
            accent="chip"
            error={job.error}
          />
          <div className="flex justify-end">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="border border-chip bg-chip px-4 py-2 font-pixel text-[9px] text-white
                         hover:brightness-110 active:scale-95
                         disabled:cursor-wait disabled:opacity-50 transition-all"
            >
              {regenerating ? "Starting…" : "Try again"}
            </button>
          </div>
        </div>
      )}

      {job.status === "done" && job.chiptune_data && (
        <div className="space-y-4">
          <ChiptunePlayer data={job.chiptune_data} title={job.track?.title} />
          <div className="flex justify-end">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="flex items-center gap-2 border border-theme px-3 py-1.5 font-pixel text-[8px]
                         text-secondary hover:border-chip/50 hover:text-chip
                         disabled:opacity-50 disabled:cursor-wait transition-colors"
            >
              {regenerating ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                  </svg>
                  Starting…
                </>
              ) : (
                <>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                  </svg>
                  Regenerate
                </>
              )}
            </button>
          </div>

          {/* Readouts */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "BPM", value: job.chiptune_data.bpm, sprite: SPRITES.notes },
              {
                label: "Melody notes",
                value: job.chiptune_data.tracks.melody.sections
                  .flatMap(s => s.measures)
                  .flatMap(m => m.notes).length,
                sprite: SPRITES.waveSquare,
              },
              {
                label: "Drum events",
                value: job.chiptune_data.tracks.drums.patterns.length,
                sprite: SPRITES.waveNoise,
              },
            ].map(stat => (
              <div key={stat.label} className="relative border border-theme bg-card p-4 text-center">
                <span
                  aria-hidden
                  className="absolute left-0 top-0 h-2 w-2 border-l border-t border-chip opacity-60"
                />
                <PixelSprite sprite={stat.sprite} className="mx-auto mb-2 h-5 w-5 text-chip" />
                <p className="font-pixel text-[13px] text-chip">{stat.value}</p>
                <p className="mt-2 text-[11px] text-secondary">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
