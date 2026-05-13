import { useQuery } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";

export interface MemberSummary {
  id: number;
  name: string;
  email: string;
  isAdmin: boolean;
  isEc: boolean;
}

export function useMembers() {
  return useQuery<MemberSummary[]>({
    queryKey: ["members"],
    queryFn: () => customFetch<MemberSummary[]>("/api/members"),
    staleTime: 60_000,
  });
}
