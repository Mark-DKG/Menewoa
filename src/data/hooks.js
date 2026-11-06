import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isSessionError } from "../lib/errors.js";

/** Loads data once per user, exposes reload(), and routes expired-session errors to auth. */
export function useLoader(loadFn, deps, onSessionError) {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState("loading"); // loading | ready | error
  const [error, setError] = useState(null);
  const fnRef = useRef(loadFn);
  fnRef.current = loadFn;

  const reload = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setStatus("loading");
    try {
      const d = await fnRef.current();
      setData(d);
      setError(null);
      setStatus("ready");
      return d;
    } catch (e) {
      if (isSessionError(e.cause || e)) onSessionError?.();
      setError(e.message || "Something went wrong.");
      setStatus((s) => (s === "ready" ? "ready" : "error"));
      throw e;
    }
  }, [onSessionError]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    reload().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return useMemo(() => ({ data, setData, status, error, reload }), [data, status, error, reload]);
}
