import LibraryView from "../components/LibraryView";
import { useTabHistory } from "../hooks/useSpotify";

export default function TabsLibrary() {
  const { data, isLoading } = useTabHistory();
  return (
    <LibraryView
      kind="tab"
      title="My Tabs"
      hint="Guitar transcriptions, ready to play along"
      emptyEmoji="🎸"
      accent="accent"
      jobs={data}
      isLoading={isLoading}
    />
  );
}
