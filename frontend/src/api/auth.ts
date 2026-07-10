import client from "./client";
import type { User } from "../types";

export const getMe = async (): Promise<User> => {
  const { data } = await client.get<User>("/auth/me");
  return data;
};

export const logout = async (): Promise<void> => {
  await client.get("/auth/logout");
};

export const loginUrl = "/api/auth/login";
