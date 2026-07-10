import client from "./client";
import type { Folder, FolderDetail, FolderItem, FolderItemType, FolderMembershipMap } from "../types";

export const getFolders = async (): Promise<Folder[]> => {
  const { data } = await client.get<Folder[]>("/folders");
  return data;
};

export const createFolder = async (name: string): Promise<Folder> => {
  const { data } = await client.post<Folder>("/folders", { name });
  return data;
};

export const renameFolder = async (folderId: string, name: string): Promise<Folder> => {
  const { data } = await client.patch<Folder>(`/folders/${folderId}`, { name });
  return data;
};

export const deleteFolder = async (folderId: string): Promise<void> => {
  await client.delete(`/folders/${folderId}`);
};

export const getFolder = async (folderId: string, itemType?: FolderItemType): Promise<FolderDetail> => {
  const { data } = await client.get<FolderDetail>(`/folders/${folderId}`, {
    params: itemType ? { item_type: itemType } : undefined,
  });
  return data;
};

export const addToFolder = async (
  folderId: string,
  spotifyTrackId: string,
  itemType: FolderItemType
): Promise<FolderItem> => {
  const { data } = await client.post<FolderItem>(`/folders/${folderId}/items`, {
    spotify_track_id: spotifyTrackId,
    item_type: itemType,
  });
  return data;
};

export const removeFromFolder = async (
  folderId: string,
  spotifyTrackId: string,
  itemType: FolderItemType
): Promise<void> => {
  await client.delete(`/folders/${folderId}/items`, {
    params: { spotify_track_id: spotifyTrackId, item_type: itemType },
  });
};

export const getMemberships = async (itemType: FolderItemType): Promise<FolderMembershipMap> => {
  const { data } = await client.get<FolderMembershipMap>("/folders/memberships", {
    params: { item_type: itemType },
  });
  return data;
};
