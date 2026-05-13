import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

interface MeResponse {
  memberId: number;
  isAdmin: boolean;
}

export function useMe(memberId: string) {
  return useQuery<MeResponse | null>({
    queryKey: ["me", memberId],
    queryFn: async () => {
      if (!memberId) return null;
      try {
        return await customFetch<MeResponse>("/api/me");
      } catch {
        return null;
      }
    },
    enabled: !!memberId,
    staleTime: 30_000,
  });
}
