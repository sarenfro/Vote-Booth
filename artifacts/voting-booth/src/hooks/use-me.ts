import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

interface MeResponse {
  memberId: string;
  isAdmin: boolean;
  isEc: boolean;
}

export function useMe(memberId: string) {
  return useQuery<MeResponse>({
    queryKey: ["me", memberId],
    queryFn: () => customFetch<MeResponse>("/api/me"),
    enabled: !!memberId,
    staleTime: 0,
    retry: false,
  });
}
