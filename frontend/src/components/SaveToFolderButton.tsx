import { useState } from "react";
import {
  useAddToFolder,
  useCreateFolder,
  useFolders,
  useMemberships,
  useRemoveFromFolder,
} from "../hooks/useFolders";
import type { FolderItemType } from "../types";
import PixelSprite from "./PixelSprite";
import { SPRITES } from "../lib/sprites";

interface SaveToFolderButtonProps {
  spotifyId: string;
  itemType: FolderItemType;
}

/**
 * Bookmark button rendered over a library card. Opens a popover listing the
 * user's folders; clicking a folder toggles this song in/out of it.
 */
export default function SaveToFolderButton({ spotifyId, itemType }: SaveToFolderButtonProps) {
  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const { data: folders } = useFolders();
  const { data: memberships } = useMemberships(itemType);
  const createFolder = useCreateFolder();
  const addToFolder = useAddToFolder();
  const removeFromFolder = useRemoveFromFolder();

  const folderIds = memberships?.[spotifyId] ?? [];
  const isSaved = folderIds.length > 0;

  const toggleFolder = (folderId: string) => {
    if (folderIds.includes(folderId)) {
      removeFromFolder.mutate({ folderId, spotifyTrackId: spotifyId, itemType });
    } else {
      addToFolder.mutate({ folderId, spotifyTrackId: spotifyId, itemType });
    }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const folder = await createFolder.mutateAsync(name);
      addToFolder.mutate({ folderId: folder.id, spotifyTrackId: spotifyId, itemType });
      setNewName("");
    } catch {
      // duplicate name or limit reached — keep the input so the user can adjust
    }
  };

  return (
    <div className="relative" onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label={isSaved ? "Saved to folder — edit" : "Save to folder"}
        title={isSaved ? "Saved — edit folders" : "Save to folder"}
        className={`flex h-7 w-7 items-center justify-center backdrop-blur-sm transition-colors ${
          isSaved ? "bg-accent text-on-accent" : "bg-black/50 text-white hover:bg-black/70"
        }`}
      >
        <PixelSprite sprite={SPRITES.folder} className="h-4 w-4" />
      </button>

      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-20" onClick={() => setOpen(false)} />

          <div className="absolute left-0 top-9 z-30 w-52 border border-theme bg-elevated p-2 shadow-xl">
            <span
              aria-hidden
              className="absolute left-0 top-0 h-2 w-2 border-l border-t border-accent opacity-70"
            />
            <p className="px-2 pb-2 pt-0.5 font-pixel text-[8px] text-secondary">Save to folder</p>

            {(!folders || folders.length === 0) && (
              <p className="px-2 pb-2 text-xs text-secondary">No folders yet — create one below.</p>
            )}

            <div className="max-h-44 overflow-y-auto">
              {folders?.map((folder) => {
                const active = folderIds.includes(folder.id);
                return (
                  <button
                    key={folder.id}
                    onClick={() => toggleFolder(folder.id)}
                    className={`flex w-full items-center justify-between px-2 py-1.5 text-left text-sm transition-colors hover:bg-card-hover ${
                      active ? "font-semibold text-accent" : "text-primary"
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-1.5">
                      <PixelSprite sprite={SPRITES.folder} className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{folder.name}</span>
                    </span>
                    {active && <CheckIcon />}
                  </button>
                );
              })}
            </div>

            <div className="mt-1 flex items-center gap-1 border-t border-theme pt-2">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="New folder…"
                className="min-w-0 flex-1 border border-theme bg-card px-2 py-1 text-xs text-primary placeholder:text-secondary focus:border-accent/60 focus:outline-none"
              />
              <button
                onClick={handleCreate}
                disabled={!newName.trim() || createFolder.isPending}
                className="bg-accent px-2 py-1 font-pixel text-[8px] text-on-accent disabled:opacity-40"
              >
                Add
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
