import type { TabJob } from "../types";

interface PipelineStatusProps {
  job: TabJob;
}

const steps = [
  { key: "downloading",  label: "Downloading audio" },
  { key: "separating",   label: "Separating guitar track" },
  { key: "detecting",    label: "Detecting guitar" },
  { key: "transcribing", label: "Transcribing notes" },
  { key: "building",     label: "Building tabs" },
];

const STEP_ORDER = steps.map((s) => s.key);

function getStepStatus(
  jobStatus: TabJob["status"],
  stepKey: string,
  currentStep: string | null,
) {
  if (jobStatus === "done") return "done";
  if (jobStatus === "failed") return stepKey === (currentStep ?? "downloading") ? "failed" : "pending";
  if (jobStatus === "processing") {
    const currentIdx = currentStep ? STEP_ORDER.indexOf(currentStep) : 0;
    const stepIdx = STEP_ORDER.indexOf(stepKey);
    if (stepIdx < currentIdx) return "done";
    if (stepIdx === currentIdx) return "active";
    return "pending";
  }
  return "pending";
}

export default function PipelineStatus({ job }: PipelineStatusProps) {
  if (job.status === "done" && job.has_guitar === false) {
    return (
      <div className="bg-card border border-theme rounded-xl p-6 text-center">
        <p className="text-3xl mb-2">🎸</p>
        <p className="text-primary font-medium">No guitar detected in this track</p>
        <p className="text-secondary text-sm mt-1">Try a different song</p>
      </div>
    );
  }

  return (
    <div className="bg-card border border-theme rounded-xl p-6 space-y-4">
      {job.track && (
        <div className="flex items-center gap-3 pb-4 border-b border-theme">
          {job.track.image_url && (
            <img src={job.track.image_url} alt="" className="w-12 h-12 rounded-lg" />
          )}
          <div>
            <p className="font-semibold text-primary">{job.track.title}</p>
            <p className="text-sm text-secondary">{job.track.artist}</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step) => {
          const status = getStepStatus(job.status, step.key, job.current_step);
          return (
            <div key={step.key} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold
                ${status === "done"    ? "bg-accent text-black" : ""}
                ${status === "active"  ? "border-2 border-accent animate-pulse" : ""}
                ${status === "pending" ? "border border-theme" : ""}
                ${status === "failed"  ? "bg-red-500 text-white" : ""}
              `}>
                {status === "done" && "✓"}
                {status === "failed" && "✕"}
              </div>
              <span className={`text-sm ${status === "active" ? "text-primary font-medium" : "text-secondary"}`}>
                {step.label}
              </span>
              {status === "active" && (
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

      {job.status === "failed" && job.error && (
        <p className="text-sm text-red-400 bg-red-500/10 rounded-lg p-3 mt-2">{job.error}</p>
      )}
    </div>
  );
}
