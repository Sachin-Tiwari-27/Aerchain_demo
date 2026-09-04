"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function RfxComparePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    window.localStorage.setItem("aerchain:selected-rfx-id", params.id);
    router.replace("/compare");
  }, [params.id, router]);

  return <p className="text-sm text-slate-500">Opening RFx comparison...</p>;
}
