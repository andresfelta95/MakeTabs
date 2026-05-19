import { useQuery } from "@tanstack/react-query";
import { getMe } from "../api/auth";

export function useAuth() {
  const { data: user, isLoading } = useQuery({
    queryKey: ["me"],
    queryFn: getMe,
    retry: false,
    staleTime: 5 * 60 * 1000, // 5 min
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    isUnauthenticated: !isLoading && !user,
  };
}
