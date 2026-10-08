import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "./api";
import { parseCatalog, parseMachines } from "./model";
import type { Catalog, Machine } from "./model";
import { sampleCatalog, sampleMachines } from "./samples";
export type Mode = "live" | "sample";
export function useMachines(base: string, mode: Mode, paused: boolean) {
  const [machines, setMachines] = useState<Machine[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((n) => n + 1), []);
  const source = `${mode}:${base}`;
  const currentSource = useRef(source);
  useEffect(() => {
    currentSource.current = source;
    setMachines([]);
    setLastFetch(null);
    setError("");
    setLoading(true);
  }, [source]);
  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    const run = async () => {
      if (document.hidden && !disposed) {
        timer = setTimeout(run, 2000);
        return;
      }
      controller = new AbortController();
      setLoading(true);
      try {
        const data =
          mode === "sample"
            ? sampleMachines(Date.now())
            : parseMachines(
                await fetchJson(base, "/machines", controller.signal),
              );
        if (disposed || currentSource.current !== source) return;
        setMachines(data);
        setLastFetch(Date.now());
        setError("");
      } catch (err) {
        if (!disposed)
          setError(
            err instanceof Error ? err.message : "Unable to load machines.",
          );
      } finally {
        if (!disposed) {
          setLoading(false);
          if (!paused && mode === "live") timer = setTimeout(run, 2000);
        }
      }
    };
    // Pause stops automatic requests; a manual refresh still performs one read.
    void run();
    return () => {
      disposed = true;
      controller?.abort();
      clearTimeout(timer);
    };
  }, [base, source, mode, paused, revision]);
  return { machines, error, loading, lastFetch, refresh };
}
export function useCatalog(
  base: string,
  mode: Mode,
  deviceId: string | undefined,
) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    setCatalog(null);
    setError("");
    if (!deviceId) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    let disposed = false;
    setLoading(true);
    const run = async () => {
      try {
        const data =
          mode === "sample"
            ? sampleCatalog(deviceId)
            : parseCatalog(
                await fetchJson(
                  base,
                  `/catalog?deviceId=${encodeURIComponent(deviceId)}`,
                  controller.signal,
                ),
                deviceId,
              );
        if (!disposed) setCatalog(data);
      } catch (err) {
        if (!disposed)
          setError(
            err instanceof Error
              ? err.message
              : "Unable to load the register map.",
          );
      } finally {
        if (!disposed) setLoading(false);
      }
    };
    void run();
    return () => {
      disposed = true;
      controller.abort();
    };
  }, [base, mode, deviceId, revision]);
  // Never render a previous device's catalog while the effect catches up.
  return {
    catalog: catalog?.deviceId === deviceId ? catalog : null,
    error,
    loading,
    refresh: () => setRevision((n) => n + 1),
  };
}
