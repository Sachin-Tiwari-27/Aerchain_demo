"use client";

import { useRef, useState } from "react";
import { recordActivity } from "@/lib/activity-log";
import { cn } from "@/lib/utils";
import { suggestVendorFromFilename, type VendorMatchSuggestion } from "@/procurement/vendor-matching";

export interface BulkUploaderVendor {
  id: string;
  name: string;
}

export interface UploadedDocument {
  id: string;
  vendor_id: string;
  filename: string;
  file_type: string;
  storage_path?: string | null;
  processing_status: "UPLOADED" | "EXTRACTED" | "ERROR";
  processed_at: string | null;
  extracted_text?: string | null;
  metadata?: Record<string, unknown>;
}

export interface BulkUploaderProps {
  rfxId: string;
  vendors: BulkUploaderVendor[];
  onUploaded: (docs: UploadedDocument[]) => void;
}

type RowStatus = "queued" | "uploading" | "success" | "error";

interface StagingRow {
  id: string;
  file: File;
  suggestion: VendorMatchSuggestion;
  vendorId: string;
  status: RowStatus;
  error?: string;
}

const ACCEPTED_EXTENSIONS = ".pdf,.png,.jpg,.jpeg,.webp,.gif,.bmp,.tif,.tiff,.txt,.csv,.json,.md,.docx,.xlsx,.xls,.xlsm";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileTypeBadge(file: File): string {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ext) return "FILE";
  return ext.toUpperCase().slice(0, 4);
}

export function BulkUploader({ rfxId, vendors, onUploaded }: BulkUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [staging, setStaging] = useState<StagingRow[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);

  const addFiles = (files: FileList | File[]) => {
    const incoming = Array.from(files);
    if (incoming.length === 0) return;

    setStaging((current) => {
      const next = [...current];
      for (const file of incoming) {
        const suggestion = suggestVendorFromFilename(file.name, vendors);
        next.push({
          id: `${file.name}-${file.size}-${file.lastModified}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          suggestion,
          vendorId: suggestion.vendorId ?? "",
          status: "queued",
        });
      }
      return next;
    });
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (event.dataTransfer.files.length > 0) addFiles(event.dataTransfer.files);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
  };

  const removeRow = (id: string) => {
    setStaging((current) => current.filter((row) => row.id !== id));
  };

  const clearAll = () => {
    setStaging([]);
  };

  const retryRow = (id: string) => {
    setStaging((current) =>
      current.map((row) => (row.id === id ? { ...row, status: "queued", error: undefined } : row)),
    );
  };

  const updateVendor = (id: string, vendorId: string) => {
    setStaging((current) => current.map((row) => (row.id === id ? { ...row, vendorId } : row)));
  };

  const uploadAll = async () => {
    const ready = staging.filter((row) => row.status !== "success");
    if (ready.length === 0) return;

    const missing = ready.filter((row) => !row.vendorId);
    if (missing.length > 0) return;

    setBusy(true);
    setStaging((current) =>
      current.map((row) => (ready.some((r) => r.id === row.id) ? { ...row, status: "uploading", error: undefined } : row)),
    );

    const formData = new FormData();
    formData.append("rfxId", rfxId);
    formData.append("processAfterUpload", "false");
    for (const row of ready) {
      formData.append("files", row.file);
      formData.append("vendorIds", row.vendorId);
    }

    recordActivity("Responses", "Bulk upload started", `${ready.length} files`, "running");

    try {
      const response = await fetch("/api/responses/upload", { method: "POST", body: formData });
      const payload = await response.json();

      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || `Upload failed (${response.status})`);
      }

      const results: Array<{ filename: string; success: boolean; document?: UploadedDocument; error?: string; extraction?: { success: boolean; model?: string; provider?: string; error?: string } }> =
        payload.results ?? [];

      const uploadedDocs = results.flatMap((result) =>
        result.success && result.document ? [result.document] : [],
      );
      setStaging((current) =>
        current.map((row) => {
          if (row.status === "success") return row;
          const match = results.find((r) => r.filename === row.file.name);
          if (!match) return row;
          if (match.success && match.document) {
            return { ...row, status: "success" };
          }
          return { ...row, status: "error", error: match.error || "Upload failed" };
        }),
      );

      recordActivity(
        "Responses",
        uploadedDocs.length === ready.length ? "Bulk upload completed" : "Bulk upload partial",
        `${uploadedDocs.length} of ${ready.length} succeeded`,
        uploadedDocs.length === ready.length ? "success" : "error",
      );

      if (uploadedDocs.length > 0) onUploaded(uploadedDocs);

    } catch (err) {
      const message = err instanceof Error ? err.message : "Upload failed";
      recordActivity("Responses", "Bulk upload failed", message, "error");
      setStaging((current) =>
        current.map((row) => (ready.some((r) => r.id === row.id) ? { ...row, status: "error", error: message } : row)),
      );
    } finally {
      setBusy(false);
    }
  };

  const readyToUpload = staging.filter((row) => row.status !== "success");
  const blocked = readyToUpload.filter((row) => !row.vendorId).length;
  const completedCount = staging.filter((row) => row.status === "success").length;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-col gap-1">
        <h3 className="text-lg font-semibold">Add supplier responses</h3>
        <p className="text-sm text-slate-500">
          Drop one or more files below. We&apos;ll guess the supplier from each filename — you can change any guess before uploading.
        </p>
      </div>

      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => inputRef.current?.click()}
        className={cn(
          "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
          dragOver ? "border-sky-400 bg-sky-50" : "border-slate-300 bg-slate-50 hover:border-sky-300 hover:bg-sky-50/40",
        )}
        role="button"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        aria-label="Drop files here or click to browse"
      >
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-sky-100 text-sky-700">
          <span className="text-lg">⬆</span>
        </div>
        <p className="text-sm font-semibold text-slate-700">
          {dragOver ? "Drop to add files" : "Drag & drop files here"}
        </p>
        <p className="text-xs text-slate-500">or click to browse — supports PDF, image, Word, Excel, CSV, JSON, Markdown, and text</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS}
          multiple
          className="sr-only"
          onChange={(event) => {
            if (event.target.files) addFiles(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      {staging.length > 0 && (
        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">
              Staged files <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{staging.length}</span>
            </h4>
            <button
              type="button"
              onClick={clearAll}
              disabled={busy}
              className="text-xs font-semibold text-slate-500 hover:text-slate-900 disabled:opacity-50"
            >
              Clear all
            </button>
          </div>

          <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {staging.map((row) => {
              const status = row.status;
              const matchedVendor = vendors.find((v) => v.id === row.vendorId);
              return (
                <li key={row.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-4 py-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 font-mono text-[10px] font-bold text-slate-600">
                    {fileTypeBadge(row.file)}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-medium text-slate-900">{row.file.name}</p>
                      <span className="text-xs text-slate-500">{formatBytes(row.file.size)}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <select
                        value={row.vendorId}
                        onChange={(event) => updateVendor(row.id, event.target.value)}
                        disabled={busy || status === "uploading" || status === "success"}
                        className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700"
                      >
                        <option value="">Select vendor…</option>
                        {vendors.map((vendor) => (
                          <option key={vendor.id} value={vendor.id}>{vendor.name}</option>
                        ))}
                      </select>
                      {row.suggestion.vendorId ? (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em]",
                            row.suggestion.confidence === "high"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-amber-100 text-amber-700",
                          )}
                          title={row.suggestion.reason}
                        >
                          {row.suggestion.confidence === "high" ? "🤖 auto-matched" : "🤖 suggested · confirm"}
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-slate-500" title={row.suggestion.reason}>
                          👤 pick vendor
                        </span>
                      )}
                      {matchedVendor && status !== "success" && status !== "uploading" && row.suggestion.vendorId !== row.vendorId && row.vendorId ? (
                        <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-sky-700">manually set</span>
                      ) : null}
                    </div>
                    {status === "error" && row.error && (
                      <p className="mt-1 text-xs text-rose-600">{row.error}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {status === "uploading" && <span className="h-2 w-2 animate-pulse rounded-full bg-sky-500" aria-label="uploading" />}
                    {status === "success" && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-emerald-700">✓ sent</span>}
                    {status === "error" && (
                      <button
                        type="button"
                        onClick={() => retryRow(row.id)}
                        className="text-xs font-semibold text-amber-700 hover:text-amber-900"
                      >
                        Retry
                      </button>
                    )}
                    {status !== "success" && (
                      <button
                        type="button"
                        onClick={() => removeRow(row.id)}
                        disabled={busy}
                        aria-label={`Remove ${row.file.name}`}
                        className="text-xs font-semibold text-slate-400 hover:text-rose-600 disabled:opacity-50"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {blocked > 0 && (
            <p className="text-xs text-amber-700">{blocked} file{blocked === 1 ? "" : "s"} need a vendor before uploading.</p>
          )}

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
            <button
              type="button"
              onClick={uploadAll}
              disabled={busy || readyToUpload.length === 0 || blocked > 0}
              className="rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-sky-700 disabled:bg-slate-300"
            >
              {busy
                ? `Uploading ${readyToUpload.length}…`
                : completedCount > 0 && readyToUpload.length > 0
                ? `Upload remaining (${readyToUpload.length})`
                : `Upload all (${staging.length})`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}