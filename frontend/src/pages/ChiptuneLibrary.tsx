import LibraryView from "../components/LibraryView";
import { SPRITES } from "../lib/sprites";
import { useChiptuneHistory } from "../hooks/useSpotify";

export default function ChiptuneLibrary() {
  const { data, isLoading } = useChiptuneHistory();
  return (
    <LibraryView
      kind="chiptune"
      title="My 16-bit"
      hint="Chiptune remakes — arcade-cab energy"
      emptySprite={SPRITES.cart}
      accent="chip"
      jobs={data}
      isLoading={isLoading}
    />
  );
}
