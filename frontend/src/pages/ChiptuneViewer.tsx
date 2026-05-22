import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import ChiptunePlayer from "../components/ChiptunePlayer";
import { useChiptuneJob } from "../hooks/useSpotify";

const STEPS = [
  { key: "downloading",  label: "Downloading audio" },
  { key: "separating",   label: "Separating stems" },
  { key: "analyzing",    label: "Analyzing tempo" },
  { key: "transcribing", label: "Transcribing instruments" },
  { key: "building",     label: "Building chiptune" },
];

function StepStatus({ status, currentStep }: { status: string; currentStep: string | null }) {
  const STEP_ORDER = STEPS.map(s => s.key);
  return (
    <div className="bg-card border border-theme rounded-xl p-6 space-y-4">
      <div className="space-y-3">
        {STEPS.map(step => {
          let s: "done" | "active" | "pending" | "failed" = "pending";
          if (status === "done") s = "done";
          else if (status === "failed") s = step.key === (currentStep ?? "downloading") ? "failed" : "pending";
          else if (status === "processing") {
            const ci = currentStep ? STEP_ORDER.indexOf(currentStep) : 0;
            const si = STEP_ORDER.indexOf(step.key);
            s = si < ci ? "done" : si === ci ? "active" : "pending";
          }
          return (
            <div key={step.key} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                ${s === "done"    ? "bg-accent text-black" : ""}
                ${s === "active"  ? "border-2 border-accent animate-pulse" : ""}
                ${s === "pending" ? "border border-theme" : ""}
                ${s === "failed"  ? "bg-red-500 text-white" : ""}
              `}>
                {s === "done" && "✓"}
                {s === "failed" && "✕"}
              </div>
              <span className={`text-sm ${s === "active" ? "text-primary font-medium" : "text-secondary"}`}>
                {step.label}
              </span>
              {s === "active" && (
                <span className="inline-flex items-end gap-[2px] h-3 ml-1">
                  <span className="w-[3px] bg-accent rounded-full animate-eq1" />
                  <span className="w-[3px] bg-accent rounded-full animate-eq2" />
                  <span className="w-[3px] bg-accent rounded-full animate-eq3" />
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function ChiptuneViewer() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate  = useNavigate();
  const { data: job, isLoading } = useChiptuneJob(jobId ?? null);

  if (isLoading || !job) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
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
        <div className="flex items-center gap-4 mb-6">
          {job.track.image_url && (
            <img src={job.track.image_url} alt="" className="w-16 h-16 rounded-lg shadow" />
          )}
          <div>
            <h2 className="text-xl font-bold text-primary">{job.track.title}</h2>
            <p className="text-secondary">{job.track.artist}</p>
          </div>
          <span className="ml-auto text-xs px-2.5 py-1 rounded-full bg-accent/10 text-accent border border-accent/20 font-semibold">
            16-bit
          </span>
        </div>
      )}

      {(job.status === "pending" || job.status === "processing") && (
        <StepStatus status={job.status} currentStep={job.current_step} />
      )}

      {job.status === "failed" && (
        <div className="bg-card border border-theme rounded-xl p-6">
          <StepStatus status={job.status} currentStep={job.current_step} />
          {job.error && (
            <p className="text-sm text-red-400 bg-red-500/10 rounded-lg p-3 mt-4">{job.error}</p>
          )}
        </div>
      )}

      {job.status === "done" && job.chiptune_data && (
        <div className="space-y-4">
          <ChiptunePlayer data={job.chiptune_data} title={job.track?.title} />

          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "BPM", value: job.chiptune_data.bpm },
              {
                label: "Melody notes",
                value: job.chiptune_data.tracks.melody.sections
                  .flatMap(s => s.measures)
                  .flatMap(m => m.notes).length,
              },
              {
                label: "Drum events",
                value: job.chiptune_data.tracks.drums.patterns.length,
              },
            ].map(stat => (
              <div key={stat.label} className="bg-card border border-theme rounded-xl p-4 text-center">
                <p className="text-2xl font-bold text-accent">{stat.value}</p>
                <p className="text-xs text-secondary mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Layout>
  );
}
