import { useEffect, useState } from 'react';

type Load<T> = (signal: AbortSignal) => Promise<T>;

export function useReportSection<T>(load: Load<T> | null, refresh = 0, timeoutMs: number | null = 45_000) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    load: Load<T>;
    refresh: number;
    attempt: number;
    data: T | null;
    error: string | null;
    updatedAt: Date | null;
  }>();

  useEffect(() => {
    if (!load) return;
    const controller = new AbortController();
    const fail = (message: string) => {
      setResult({ load, refresh, attempt, data: null, error: message, updatedAt: null });
    };
    const timer = timeoutMs === null ? undefined : setTimeout(() => {
      controller.abort();
      fail('The report request timed out. Please retry.');
    }, timeoutMs);

    async function run(request: Load<T>) {
      try {
        const data = await request(controller.signal);
        if (!controller.signal.aborted) {
          setResult({ load: request, refresh, attempt, data, error: null, updatedAt: new Date() });
        }
      } catch (error) {
        if (!controller.signal.aborted) fail(error instanceof Error ? error.message : 'Unable to load report data.');
      } finally {
        clearTimeout(timer);
      }
    }
    void run(load);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, refresh, attempt, timeoutMs]);

  // Hide the previous clinic or date immediately, even before the new effect starts.
  const current = result && result.load === load && result.refresh === refresh && result.attempt === attempt ? result : null;
  return {
    loading: Boolean(load && !current),
    data: current?.data ?? null,
    error: current?.error ?? null,
    updatedAt: current?.updatedAt ?? null,
    retry: () => setAttempt(value => value + 1),
  };
}
