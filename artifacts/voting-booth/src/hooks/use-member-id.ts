import { useState, useEffect } from "react";
import { setCustomHeaders } from "@workspace/api-client-react";

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
