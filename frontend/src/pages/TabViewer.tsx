import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import Layout from "../components/Layout";
import PipelineStatus from "../components/PipelineStatus";
import TabPlayer from "../components/TabPlayer";
import BackendAudioPlayer from "../components/BackendAudioPlayer";
import PixelSprite from "../components/PixelSprite";
import { SPRITES } from "../lib/sprites";
import { useTabJob } from "../hooks/useSpotify";
import { generateTabs } from "../api/spotify";
import type { GuitarTab, LyricsSection, TabData, TabSection } from "../types";

export default function TabViewer() {
  const { jobId } = useParams<{ jobId: string }>();
  const navigate = useNavigate();
  const { data: job, isLoading } = useTabJob(jobId ?? null);
  const [regenerating, setRegenerating] = useState(false);

  async function handleRegenerate() {
    if (!job?.track?.spotify_id || regenerating) return;
    setRegenerating(true);
    try {
      const newJob = await generateTabs(job.track.spotify_id, true);
      navigate(`/tab/${newJob.job_id}`, { replace: true });
    } finally {
      setRegenerating(false);
    }
  }

  if (isLoading || !job) {
    return (
      <Layout>
        <div className="flex flex-col items-center justify-center gap-3 py-20">
          <PixelSprite sprite={SPRITES.pick} className="h-10 w-10 text-accent pix-bob" />
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

      {(job.status === "pending" || job.status === "processing") && (
        <PipelineStatus job={job} />
      )}

      {job.status === "done" && job.has_guitar === false && (
        <PipelineStatus job={job} />
      )}

      {job.status === "failed" && (
        <div className="space-y-4">
          <PipelineStatus job={job} />
          <div className="flex justify-end">
            <button
              onClick={handleRegenerate}
              disabled={regenerating}
              className="border border-accent bg-accent px-4 py-2 font-pixel text-[9px] text-on-accent
                         hover:brightness-110 active:scale-95
                         disabled:cursor-wait disabled:opacity-50 transition-all"
            >
              {regenerating ? "Starting…" : "Try again"}
            </button>
          </div>
        </div>
      )}

      {job.status === "done" && job.has_guitar === true && job.tab_data && (
        <div className="space-y-6">
          <div className="flex items-center gap-4">
            {job.track?.image_url && (
              <img src={job.track.image_url} alt="" className="h-16 w-16 object-cover" />
            )}
            <div className="flex-1">
              <h2 className="text-xl font-bold text-primary">{job.track?.title}</h2>
              <p className="text-secondary">{job.track?.artist}</p>
            </div>
            <div className="flex items-center gap-2">
              <DownloadButton tab={job.tab_data} title={job.track?.title} artist={job.track?.artist} />
              <button
                onClick={handleRegenerate}
                disabled={regenerating}
                title="Regenerate tab"
                className="flex items-center gap-2 border border-theme px-3 py-1.5 font-pixel text-[8px]
                           text-secondary hover:border-accent/50 hover:text-accent
                           disabled:opacity-50 disabled:cursor-wait transition-colors"
              >
                {regenerating ? (
                  <svg className="animate-spin w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" strokeOpacity="0.3"/>
                    <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round"/>
                  </svg>
                ) : (
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                  </svg>
                )}
                {regenerating ? "Starting…" : "Regenerate"}
              </button>
            </div>
          </div>
          <TabDisplay tab={job.tab_data} songTitle={job.track?.title} jobId={jobId!} />
        </div>
      )}
    </Layout>
  );
}

function buildTabText(tab: TabData, title?: string, artist?: string): string {
  const header = [
    title && artist ? `${title} — ${artist}` : title ?? artist ?? "Guitar Tab",
    `Tuning: ${(tab.tuning ?? []).join(" ")}   BPM: ${tab.bpm}`,
    "",
  ].join("\n");

  const guitars = tab.guitars ?? (tab.sections ? [{ name: "Guitar", sections: tab.sections }] : []);
  const strings = (tab.tuning ?? []).slice().reverse();

  return (
    header +
    guitars
      .map((g) =>
        (guitars.length > 1 ? `\n── ${g.name} ──\n` : "") +
        g.sections
          .map((s) => `\n${s.name}\n${renderSection(s, strings)}`)
          .join("")
      )
      .join("\n")
  );
}

interface DownloadButtonProps {
  tab: TabData;
  title?: string;
  artist?: string;
}

function DownloadButton({ tab, title, artist }: DownloadButtonProps) {
  function handleDownload() {
    const text = buildTabText(tab, title, artist);
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const safeName = (title ?? "tab").replace(/[^a-z0-9_\- ]/gi, "_");
    a.download = `${safeName}_tab.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button
      onClick={handleDownload}
      title="Download tab as text"
      className="flex items-center gap-2 border border-chip/50 px-3 py-1.5 font-pixel text-[8px]
                 text-chip hover:bg-chip/10 transition-colors"
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 3v13M5 16l7 7 7-7"/><line x1="3" y1="23" x2="21" y2="23"/>
      </svg>
      TXT
    </button>
  );
}

function TabDisplay({ tab, songTitle, jobId }: { tab: TabData; songTitle?: string; jobId: string }) {
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
                className={`flex items-center gap-1.5 border px-3 py-1.5 font-pixel text-[8px] transition-colors
                  ${activeGuitar === i
                    ? "border-accent bg-accent text-on-accent"
                    : "border-theme text-secondary hover:border-accent/50 hover:text-accent"
                  }`}
              >
                {g.name}
              </button>
            ))}
          </div>
        )}
        <TabPlayer tab={tab} songTitle={songTitle} />
        <BackendAudioPlayer jobId={jobId} />
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
        <TabPlayer tab={tab} songTitle={songTitle} />
        <BackendAudioPlayer jobId={jobId} />
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

const BEATS_PER_MEASURE = 16; // sixteenth-note slots

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
    <div className="relative overflow-x-auto border border-theme bg-elevated p-6">
      <span aria-hidden className="absolute left-0 top-0 h-2.5 w-2.5 border-l border-t border-accent opacity-70" />
      <span aria-hidden className="absolute bottom-0 right-0 h-2.5 w-2.5 border-b border-r border-accent opacity-70" />
      <div className="mb-6 flex items-center gap-5 font-mono text-xs text-secondary">
        <span className="flex items-center gap-1.5">
          <PixelSprite sprite={SPRITES.pick} className="h-4 w-4 text-accent" />
          {tuning.join(" ")}
        </span>
        <span>{bpm} BPM</span>
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
                <p className="mb-1.5 font-pixel text-[8px] text-accent">{lyrics.name}</p>
                <p className="text-xs text-secondary whitespace-pre-line leading-relaxed">
                  {lyrics.text}
                </p>
              </div>
            )}

            <p className="mb-2 font-pixel text-[8px] text-secondary">{section.name}</p>

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
