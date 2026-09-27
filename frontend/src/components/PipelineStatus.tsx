import type { TabJob } from "../types";
import StepRack from "./StepRack";
import PixelSprite from "./PixelSprite";
import { SPRITES } from "../lib/sprites";

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

export default function PipelineStatus({ job }: PipelineStatusProps) {
  if (job.status === "done" && job.has_guitar === false) {
    return (
      <div className="relative border border-theme bg-card p-8 text-center">
        <PixelSprite sprite={SPRITES.pick} className="mx-auto mb-3 h-10 w-10 text-secondary" />
        <p className="font-pixel text-[10px] text-primary">No guitar detected</p>
        <p className="mt-2 text-sm text-secondary">Try a different song</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {job.track && (
        <div className="flex items-center gap-3 border border-theme bg-card p-3">
          {job.track.image_url && (
            <img src={job.track.image_url} alt="" className="h-12 w-12 object-cover" />
          )}
          <div className="min-w-0">
            <p className="truncate font-semibold text-primary">{job.track.title}</p>
            <p className="truncate text-sm text-secondary">{job.track.artist}</p>
          </div>
        </div>
      )}

      <StepRack
        steps={steps}
        status={job.status}
        currentStep={job.current_step}
        accent="accent"
        error={job.status === "failed" ? job.error : null}
      />
    </div>
  );
}
