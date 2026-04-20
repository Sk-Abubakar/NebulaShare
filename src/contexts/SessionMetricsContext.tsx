import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

type SessionMetrics = {
  filesShared: number;
  dataTransferredBytes: number;
  activeConnections: number;
};

type SessionMetricsContextValue = SessionMetrics & {
  dataTransferredMb: number;
  resetMetrics: () => void;
};

const initialMetrics: SessionMetrics = {
  filesShared: 0,
  dataTransferredBytes: 0,
  activeConnections: 0,
};

const SessionMetricsContext = createContext<SessionMetricsContextValue | null>(null);

export function SessionMetricsProvider({ children }: { children: ReactNode }) {
  const [metrics, setMetrics] = useState<SessionMetrics>(initialMetrics);

  useEffect(() => {
    const onMetrics = (event: Event) => {
      const detail = (event as CustomEvent<Partial<SessionMetrics>>).detail;
      if (!detail) return;
      setMetrics((prev) => ({
        filesShared: detail.filesShared ?? prev.filesShared,
        dataTransferredBytes: detail.dataTransferredBytes ?? prev.dataTransferredBytes,
        activeConnections: detail.activeConnections ?? prev.activeConnections,
      }));
    };

    window.addEventListener("nebula:metrics", onMetrics as EventListener);
    return () => window.removeEventListener("nebula:metrics", onMetrics as EventListener);
  }, []);

  const value = useMemo<SessionMetricsContextValue>(
    () => ({
      ...metrics,
      dataTransferredMb: Number((metrics.dataTransferredBytes / (1024 * 1024)).toFixed(2)),
      resetMetrics: () => setMetrics(initialMetrics),
    }),
    [metrics],
  );

  return <SessionMetricsContext.Provider value={value}>{children}</SessionMetricsContext.Provider>;
}

export function useSessionMetrics() {
  const ctx = useContext(SessionMetricsContext);
  if (!ctx) throw new Error("useSessionMetrics must be used within SessionMetricsProvider");
  return ctx;
}
