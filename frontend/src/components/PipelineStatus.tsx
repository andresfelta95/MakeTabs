import type { TabJob } from "../types";

interface PipelineStatusProps {
  job: TabJob;
}

const steps = [
  { key: "downloading", label: "Downloading audio" },
  { key: "separating", label: "Separating guitar track" },
  { key: "detecting", label: "Detecting guitar" },
  { key: "transcribing", label: "Transcribing notes" },
  { key: "building", label: "Building tabs" },
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
      <div className="bg-spotify-card rounded-xl p-6 text-center">
        <p className="text-2xl mb-2">🎸</p>
        <p className="text-gray-300 font-medium">No guitar detected in this track</p>
        <p className="text-gray-500 text-sm mt-1">Try a different song</p>
      </div>
    );
  }

  return (
    <div className="bg-spotify-card rounded-xl p-6 space-y-4">
      {job.track && (
        <div className="flex items-center gap-3 pb-3 border-b border-white/10">
          {job.track.image_url && (
            <img src={job.track.image_url} alt="" className="w-12 h-12 rounded" />
          )}
          <div>
            <p className="font-medium text-white">{job.track.title}</p>
            <p className="text-sm text-gray-400">{job.track.artist}</p>
          </div>
        </div>
      )}

      <div className="space-y-3">
        {steps.map((step) => {
          const status = getStepStatus(job.status, step.key, job.current_step);
          return (
            <div key={step.key} className="flex items-center gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs
                ${status === "done" ? "bg-spotify-green text-black" : ""}
                ${status === "active" ? "border-2 border-spotify-green animate-pulse" : ""}
                ${status === "pending" ? "border border-gray-600" : ""}
                ${status === "failed" ? "bg-red-500 text-white" : ""}
              `}>
                {status === "done" && "✓"}
                {status === "failed" && "✕"}
              </div>
              <span className={`text-sm ${status === "active" ? "text-white" : "text-gray-400"}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>

      {job.status === "failed" && job.error && (
        <p className="text-sm text-red-400 mt-2">{job.error}</p>
      )}
    </div>
  );
}
