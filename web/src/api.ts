import { useCallback, useEffect, useRef, useState } from "react";
import { demoReply } from "./demo";
import i18n from "./i18n";

export const hostedDemo = import.meta.env.VITE_DEMO_ONLY === "true";
export const demo = hostedDemo || window.location.pathname.startsWith("/demo");

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  if (demo) {
    if (options.method && options.method !== "GET")
      throw new ApiError(
        "This is a read-only demo. Sign in to your own workspace to make changes.",
        403,
      );
    return structuredClone(demoReply(path)) as T;
  }
  const response = await fetch(path, {
    ...options,
    headers: { "Content-Type": "application/json", ...options.headers },
    credentials: "same-origin",
  });
  if (!response.headers.get("content-type")?.includes("application/json")) {
    throw new ApiError(
      response.status >= 500
        ? i18n.t(
            "The panel or its access tunnel is unavailable (HTTP {{status}}). Retry after it reconnects.",
            { status: response.status },
          )
        : i18n.t("Unexpected panel response (HTTP {{status}}).", {
            status: response.status,
          }),
      response.status,
    );
  }
  const data: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof data === "object" && data !== null && "error" in data
        ? String(data.error)
        : i18n.t("Request failed ({{status}})", { status: response.status });
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export function post<T>(path: string, body: unknown, method = "POST") {
  return api<T>(path, { method, body: JSON.stringify(body) });
}

export function useApi<T>(path: string | null, poll = 0, revision = 0) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const requests = useRef({ sequence: 0 });
  const previousPath = useRef(path);
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!path) {
        setLoading(false);
        return;
      }
      const current = ++requests.current.sequence;
      try {
        const result = await api<T>(path, { signal });
        if (current === requests.current.sequence) {
          setData(result);
          setError(null);
        }
      } catch (error) {
        if (
          current === requests.current.sequence &&
          error instanceof Error &&
          error.name !== "AbortError"
        )
          setError(error);
      } finally {
        if (current === requests.current.sequence) setLoading(false);
      }
    },
    [path],
  );
  useEffect(() => {
    const controller = new AbortController();
    const pending = requests.current;
    if (previousPath.current !== path) setData(null);
    previousPath.current = path;
    setError(null);
    setLoading(true);
    void refresh(controller.signal);
    const timer = poll
      ? window.setInterval(() => {
          if (!document.hidden) void refresh(controller.signal);
        }, poll)
      : undefined;
    return () => {
      pending.sequence++;
      controller.abort();
      window.clearInterval(timer);
    };
  }, [refresh, poll, revision, path]);
  return { data, error, loading, refresh: () => refresh() };
}

export function useDebounce(value: string, delay = 350) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
