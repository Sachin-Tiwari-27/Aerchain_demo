"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

export default function RfxAskPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    window.localStorage.setItem("aerchain:selected-rfx-id", params.id);
    router.replace("/ask");
  }, [params.id, router]);

  return <p className="text-sm text-slate-500">Opening RFx analyst...</p>;
}
