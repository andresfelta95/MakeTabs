import LibraryView from "../components/LibraryView";
import { SPRITES } from "../lib/sprites";
import { useTabHistory } from "../hooks/useSpotify";

export default function TabsLibrary() {
  const { data, isLoading } = useTabHistory();
  return (
    <LibraryView
      kind="tab"
      title="My Tabs"
      hint="Guitar transcriptions, ready to play along"
      emptySprite={SPRITES.pick}
      accent="accent"
      jobs={data}
      isLoading={isLoading}
    />
  );
}
