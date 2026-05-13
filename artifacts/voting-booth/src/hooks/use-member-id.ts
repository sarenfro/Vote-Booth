import { useState, useCallback, createContext, useContext } from "react";
import { setCustomHeaders } from "@workspace/api-client-react";

export const MemberIdContext = createContext<{
  memberId: string;
  setMemberId: (id: string) => void;
}>({ memberId: "", setMemberId: () => {} });

export function useMemberId() {
  const [memberId, _setMemberId] = useState<string>("");

  const setMemberId = useCallback((id: string) => {
    if (id) {
      setCustomHeaders({ "X-Member-Id": id });
    } else {
      setCustomHeaders({});
    }
    _setMemberId(id);
  }, []);

  return [memberId, setMemberId] as const;
}

export function useMemberIdContext() {
  return useContext(MemberIdContext);
}
