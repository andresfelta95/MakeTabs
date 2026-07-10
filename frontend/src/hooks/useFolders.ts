import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addToFolder,
  createFolder,
  deleteFolder,
  getFolder,
  getFolders,
  getMemberships,
  removeFromFolder,
  renameFolder,
} from "../api/folders";
import type { FolderItemType } from "../types";

export function useFolders() {
  return useQuery({
    queryKey: ["folders"],
    queryFn: getFolders,
    staleTime: 30_000,
  });
}

export function useFolder(folderId: string | null, itemType: FolderItemType) {
  return useQuery({
    queryKey: ["folder", folderId, itemType],
    queryFn: () => getFolder(folderId!, itemType),
    enabled: !!folderId,
  });
}

export function useMemberships(itemType: FolderItemType) {
  return useQuery({
    queryKey: ["folder-memberships", itemType],
    queryFn: () => getMemberships(itemType),
    staleTime: 30_000,
  });
}

function useInvalidateFolders() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ["folders"] });
    queryClient.invalidateQueries({ queryKey: ["folder"] });
    queryClient.invalidateQueries({ queryKey: ["folder-memberships"] });
  };
}

export function useCreateFolder() {
  const invalidate = useInvalidateFolders();
  return useMutation({
    mutationFn: (name: string) => createFolder(name),
    onSuccess: invalidate,
  });
}

export function useRenameFolder() {
  const invalidate = useInvalidateFolders();
  return useMutation({
    mutationFn: ({ folderId, name }: { folderId: string; name: string }) =>
      renameFolder(folderId, name),
    onSuccess: invalidate,
  });
}

export function useDeleteFolder() {
  const invalidate = useInvalidateFolders();
  return useMutation({
    mutationFn: (folderId: string) => deleteFolder(folderId),
    onSuccess: invalidate,
  });
}

export function useAddToFolder() {
  const invalidate = useInvalidateFolders();
  return useMutation({
    mutationFn: ({
      folderId, spotifyTrackId, itemType,
    }: { folderId: string; spotifyTrackId: string; itemType: FolderItemType }) =>
      addToFolder(folderId, spotifyTrackId, itemType),
    onSuccess: invalidate,
  });
}

export function useRemoveFromFolder() {
  const invalidate = useInvalidateFolders();
  return useMutation({
    mutationFn: ({
      folderId, spotifyTrackId, itemType,
    }: { folderId: string; spotifyTrackId: string; itemType: FolderItemType }) =>
      removeFromFolder(folderId, spotifyTrackId, itemType),
    onSuccess: invalidate,
  });
}
