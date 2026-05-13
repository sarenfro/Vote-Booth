import { useState, useEffect, createContext, useContext } from "react";
import { setCustomHeaders } from "@workspace/api-client-react";

export const MemberIdContext = createContext<{
  memberId: string;
  setMemberId: (id: string) => void;
}>({ memberId: "", setMemberId: () => {} });

export function useMemberId() {
  const [memberId, setMemberId] = useState<string>("");

  useEffect(() => {
    if (memberId) {
      setCustomHeaders({ "X-Member-Id": memberId });
    } else {
      setCustomHeaders({});
    }
  }, [memberId]);

  return [memberId, setMemberId] as const;
}

export function useMemberIdContext() {
  return useContext(MemberIdContext);
}
