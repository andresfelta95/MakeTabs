import LibraryView from "../components/LibraryView";
import { useChiptuneHistory } from "../hooks/useSpotify";

export default function ChiptuneLibrary() {
  const { data, isLoading } = useChiptuneHistory();
  return (
    <LibraryView
      kind="chiptune"
      title="My 16-bit"
      hint="Chiptune remakes — arcade-cab energy"
      emptyEmoji="🕹️"
      accent="chip"
      jobs={data}
      isLoading={isLoading}
    />
  );
}
