import { useState } from "react";
import PixelSprite from "./PixelSprite";
import { SPRITES } from "../lib/sprites";
import { useCreateFolder, useDeleteFolder, useFolders, useRenameFolder } from "../hooks/useFolders";
import type { FolderItemType } from "../types";

interface FolderBarProps {
  kind: FolderItemType;
  totalCount: number;
  selectedId: string | null;
  onSelect: (folderId: string | null) => void;
  accent: "accent" | "chip";
}

/**
 * Row of folder chips: "All songs", one chip per user folder (with the count
 * for this format), and a "+ New folder" chip that turns into an input.
 */
export default function FolderBar({ kind, totalCount, selectedId, onSelect, accent }: FolderBarProps) {
  const { data: folders } = useFolders();
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const activeChip =
    accent === "chip" ? "border-chip bg-chip text-white" : "border-accent bg-accent text-on-accent";
  const idleChip =
    "border-theme bg-card text-secondary hover:bg-card-hover hover:text-primary";

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const folder = await createFolder.mutateAsync(name);
      setNewName("");
      setCreating(false);
      onSelect(folder.id);
    } catch {
      // duplicate name or limit reached — keep the input open
    }
  };

  const handleRename = (folderId: string, currentName: string) => {
    const name = window.prompt("Rename folder:", currentName)?.trim();
    if (name && name !== currentName) {
      renameFolder.mutate({ folderId, name });
    }
  };

  const handleDelete = (folderId: string, name: string) => {
    if (window.confirm(`Delete folder “${name}”? The songs themselves stay in your library.`)) {
      deleteFolder.mutate(folderId);
      onSelect(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Chip
        label={`All${totalCount > 0 ? ` · ${totalCount}` : ""}`}
        icon={<PixelSprite sprite={SPRITES.cassette} className="h-3.5 w-3.5 shrink-0" />}
        active={selectedId === null}
        activeClass={activeChip}
        idleClass={idleChip}
        onClick={() => onSelect(null)}
      />

      {folders?.map((folder) => {
        const count = kind === "tab" ? folder.tab_count : folder.chiptune_count;
        const active = selectedId === folder.id;
        return (
          <span key={folder.id} className="inline-flex items-center">
            <Chip
              label={`${folder.name}${count > 0 ? ` · ${count}` : ""}`}
              icon={<PixelSprite sprite={SPRITES.folder} className="h-3.5 w-3.5 shrink-0" />}
              active={active}
              activeClass={activeChip}
              idleClass={idleChip}
              onClick={() => onSelect(folder.id)}
            />
            {active && (
              <span className="ml-1 inline-flex gap-0.5">
                <IconButton label="Rename folder" onClick={() => handleRename(folder.id, folder.name)}>
                  ✏️
                </IconButton>
                <IconButton label="Delete folder" onClick={() => handleDelete(folder.id, folder.name)}>
                  🗑️
                </IconButton>
              </span>
            )}
          </span>
        );
      })}

      {creating ? (
        <span className="inline-flex items-center gap-1">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") { setCreating(false); setNewName(""); }
            }}
            placeholder="Folder name…"
            className="w-32 border border-theme bg-card px-3 py-1.5 text-sm text-primary placeholder:text-secondary focus:border-accent/60 focus:outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || createFolder.isPending}
            className={`border px-3 py-1.5 font-pixel text-[8px] disabled:opacity-40 ${activeChip}`}
          >
            Create
          </button>
        </span>
      ) : (
        <Chip
          label="+ New folder"
          active={false}
          activeClass={activeChip}
          idleClass={`${idleChip} border-dashed`}
          onClick={() => setCreating(true)}
        />
      )}
    </div>
  );
}

function Chip({
  label, active, onClick, activeClass, idleClass, icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeClass: string;
  idleClass: string;
  icon?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 border px-2.5 py-1.5 font-pixel text-[8px] transition-colors ${
        active ? activeClass : idleClass
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      className="rounded-full p-1 text-xs transition-colors hover:bg-card-hover"
    >
      {children}
    </button>
  );
}
