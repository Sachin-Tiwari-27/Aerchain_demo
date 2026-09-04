export type ActivityStatus = "running" | "success" | "error";

export type ActivityEntry = {
  id: number;
  time: string;
  area: string;
  event: string;
  detail: string;
  status: ActivityStatus;
};

export function aiLogDetail(model: string, provider: string, detail: string): string {
  const tags: Record<string, string> = {
    "gemini-primary": "GP",
    "gemini-secondary": "GS",
    "openrouter-primary": "OP",
    "openrouter-secondary": "OS",
  };
  return `[${tags[provider] || "AI"} ${model || "unknown model"}] ${detail}`;
}

const storageKey = "aerchain:activity-log";
const eventName = "aerchain:activity-log-updated";

export function recordActivity(area: string, event: string, detail: string, status: ActivityStatus) {
  if (typeof window === "undefined") return;
  const entry: ActivityEntry = {
    id: Date.now() + Math.floor(Math.random() * 1000),
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    area,
    event,
    detail,
    status,
  };
  const current = readActivityLog();
  window.localStorage.setItem(storageKey, JSON.stringify([entry, ...current].slice(0, 200)));
  window.dispatchEvent(new CustomEvent(eventName));
}

export function readActivityLog(): ActivityEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function clearActivityLog() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(storageKey);
  window.dispatchEvent(new CustomEvent(eventName));
}

export const activityLogEventName = eventName;
