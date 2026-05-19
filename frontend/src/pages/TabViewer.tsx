import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import PipelineStatus from "../components/PipelineStatus";
import { useTabJob } from "../hooks/useSpotify";
import type { TabData } from "../types";

export default function TabViewer() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading } = useTabJob(jobId ?? null);

  if (isLoading || !job) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <div className="w-8 h-8 border-2 border-spotify-green border-t-transparent rounded-full animate-spin" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <button
        onClick={() => navigate(-1)}
        className="text-sm text-gray-400 hover:text-white mb-6 flex items-center gap-2 transition-colors"
      >
        ← Back
      </button>

      {(job.status === "pending" || job.status === "processing") && (
        <PipelineStatus job={job} />
      )}

      {job.status === "done" && job.has_guitar === false && (
        <PipelineStatus job={job} />
      )}

      {job.status === "failed" && (
        <PipelineStatus job={job} />
      )}

      {job.status === "done" && job.has_guitar === true && job.tab_data && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            {job.track?.image_url && (
              <img src={job.track.image_url} alt="" className="w-16 h-16 rounded" />
            )}
            <div>
              <h2 className="text-xl font-bold text-white">{job.track?.title}</h2>
              <p className="text-gray-400">{job.track?.artist}</p>
            </div>
          </div>
          <AsciiTab tab={job.tab_data} />
        </div>
      )}
    </Layout>
  );
}

function AsciiTab({ tab }: { tab: TabData }) {
  const strings = tab.tuning.slice().reverse(); // high e at top visually

  return (
    <div className="bg-spotify-black rounded-xl p-6 overflow-x-auto">
      <div className="flex items-center gap-6 mb-4 text-sm text-gray-400">
        <span>Tuning: {tab.tuning.join(" ")}</span>
        <span>BPM: {tab.bpm}</span>
      </div>
      {tab.sections.map((section, si) => (
        <div key={si} className="mb-8">
          <p className="text-xs font-semibold text-spotify-green uppercase tracking-wider mb-3">
            {section.name}
          </p>
          <pre className="font-mono text-sm text-gray-300 leading-relaxed whitespace-pre">
            {strings.map((string, i) => {
              const stringNum = strings.length - i; // 1-indexed from bottom
              return (
                `${string}|` +
                section.measures
                  .map((measure) => {
                    const notes = measure.notes.filter((n) => n.string === stringNum);
                    // Simplified ASCII render — Phase 2 will improve this
                    return notes.length > 0 ? notes.map((n) => `-${n.fret}-`).join("") : "---";
                  })
                  .join("|") +
                "|\n"
              );
            }).join("")}
          </pre>
        </div>
      ))}
    </div>
  );
}
