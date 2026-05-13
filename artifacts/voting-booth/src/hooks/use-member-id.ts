import { useState, useEffect } from "react";
import { setCustomHeaders } from "@workspace/api-client-react";

export function useMemberId() {
  const [memberId, setMemberId] = useState<string>(() => {
    return localStorage.getItem("mbaa_member_id") || "";
  });

  useEffect(() => {
    if (memberId) {
      localStorage.setItem("mbaa_member_id", memberId);
      setCustomHeaders({ "X-Member-Id": memberId });
    } else {
      localStorage.removeItem("mbaa_member_id");
      setCustomHeaders({});
    }
  }, [memberId]);

  return [memberId, setMemberId] as const;
}
