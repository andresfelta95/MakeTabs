import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import PipelineStatus from "../components/PipelineStatus";
import TabPlayer from "../components/TabPlayer";
import { useTabJob } from "../hooks/useSpotify";
import type { GuitarTab, LyricsSection, TabData, TabSection } from "../types";

export default function TabViewer() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading } = useTabJob(jobId ?? null);

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
              <img src={job.track.image_url} alt="" className="w-16 h-16 rounded-lg shadow" />
            )}
            <div>
              <h2 className="text-xl font-bold text-primary">{job.track?.title}</h2>
              <p className="text-secondary">{job.track?.artist}</p>
            </div>
          </div>
          <TabDisplay tab={job.tab_data} />
        </div>
      )}
    </Layout>
  );
}

function TabDisplay({ tab }: { tab: TabData }) {
  const [activeGuitar, setActiveGuitar] = useState(0);

  // v2 schema: multiple guitars + lyrics
  if (tab.guitars && tab.guitars.length > 0) {
    const guitar = tab.guitars[activeGuitar];
    return (
      <div className="space-y-4">
        {tab.guitars.length > 1 && (
          <div className="flex gap-2">
            {tab.guitars.map((g, i) => (
              <button
                key={i}
                onClick={() => setActiveGuitar(i)}
                className={`px-4 py-1.5 rounded-full text-sm font-semibold transition-colors
                  ${activeGuitar === i
                    ? "bg-accent text-black"
                    : "border border-theme text-secondary hover:text-primary"
                  }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
        <TabPlayer guitar={guitar} bpm={tab.bpm} />
        <AsciiTab
          guitar={guitar}
          lyricsSections={tab.lyrics_sections ?? []}
          tuning={tab.tuning}
          bpm={tab.bpm}
        />
      </div>
    );
  }

  // v1 schema fallback
  if (tab.sections) {
    const guitar = { name: "Guitar", sections: tab.sections };
    return (
      <div className="space-y-4">
        <TabPlayer guitar={guitar} bpm={tab.bpm} />
        <AsciiTab
          guitar={guitar}
          lyricsSections={[]}
          tuning={tab.tuning}
          bpm={tab.bpm}
        />
      </div>
    );
  }

  return null;
}

const BEATS_PER_MEASURE = 8; // eighth-note slots

function renderSlot(fret: number | null): string {
  if (fret === null) return "---";
  return String(fret).padEnd(3, "-");
}

interface AsciiTabProps {
  guitar: GuitarTab;
  lyricsSections: LyricsSection[];
  tuning: string[];
  bpm: number;
}

function AsciiTab({ guitar, lyricsSections, tuning, bpm }: AsciiTabProps) {
  const strings = tuning.slice().reverse(); // high e at top

  let lastLyricsIdx = -1;

  return (
    <div className="bg-elevated border border-theme rounded-xl p-6 overflow-x-auto">
      <div className="flex items-center gap-6 mb-6 text-sm text-secondary">
        <span>Tuning: {tuning.join(" ")}</span>
        <span>BPM: {bpm}</span>
      </div>

      {guitar.sections.map((section, si) => {
        const lyricsIdx = section.lyrics_section ?? -1;
        const showLyrics =
          lyricsSections.length > 0 &&
          lyricsIdx >= 0 &&
          lyricsIdx !== lastLyricsIdx;
        if (showLyrics) lastLyricsIdx = lyricsIdx;
        const lyrics = showLyrics ? lyricsSections[lyricsIdx] : null;

        return (
          <div key={si} className="mb-10">
            {lyrics && (
              <div className="mb-3 border-l-2 border-accent pl-3">
                <p className="text-xs font-bold text-accent uppercase tracking-wider mb-1">
                  {lyrics.name}
                </p>
                <p className="text-xs text-secondary whitespace-pre-line leading-relaxed">
                  {lyrics.text}
                </p>
              </div>
            )}

            <p className="text-xs font-semibold text-secondary uppercase tracking-wider mb-2">
              {section.name}
            </p>

            <pre className="font-mono text-sm text-primary leading-relaxed whitespace-pre">
              {renderSection(section, strings)}
            </pre>
          </div>
        );
      })}
    </div>
  );
}

function renderSection(section: TabSection, strings: string[]): string {
  return strings
    .map((stringName, i) => {
      const stringNum = strings.length - i;
      return (
        `${stringName}|` +
        section.measures
          .map((measure) => {
            const slots: (number | null)[] = Array(BEATS_PER_MEASURE).fill(null);
            measure.notes
              .filter((n) => n.string === stringNum)
              .forEach((n) => {
                const beat = n.beat ?? 0;
                const idx = Math.min(beat, BEATS_PER_MEASURE - 1);
                if (slots[idx] === null) slots[idx] = n.fret;
              });
            return slots.map(renderSlot).join("");
          })
          .join("|") +
        "|\n"
      );
    })
    .join("");
}
