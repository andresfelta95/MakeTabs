import { useState } from "react";
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

  const activeChip = accent === "chip" ? "bg-chip text-white" : "bg-accent text-on-accent";
  const idleChip = "bg-card text-secondary hover:bg-card-hover hover:text-primary border border-theme";

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
        label={`All songs${totalCount > 0 ? ` · ${totalCount}` : ""}`}
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
              label={`📁 ${folder.name}${count > 0 ? ` · ${count}` : ""}`}
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
            className="w-32 rounded-full border border-theme bg-card px-3 py-1.5 text-sm text-primary placeholder:text-secondary focus:border-accent/60 focus:outline-none"
          />
          <button
            onClick={handleCreate}
            disabled={!newName.trim() || createFolder.isPending}
            className={`rounded-full px-3 py-1.5 text-sm font-bold disabled:opacity-40 ${activeChip}`}
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
  label, active, onClick, activeClass, idleClass,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  activeClass: string;
  idleClass: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${active ? activeClass : idleClass}`}
    >
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
