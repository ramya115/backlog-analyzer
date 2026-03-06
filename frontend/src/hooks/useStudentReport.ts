"use client";

import { useEffect, useRef, useState } from "react";

export interface StudentReportResult {
  subject_code: string;
  subject_name: string;
  report: string;
  qp_pattern: string;
  partial: boolean;
  created_at: string | null;
  updated_at: string | null;
}

export interface UseStudentReportReturn {
  data: StudentReportResult | null;
  loading: boolean;
  error: string | null;
}

/**
 * Fetches a professor-stored AI analysis report for a given subject code.
 *
 * This is a fast DB-only read (no Gemini call, no file processing).
 * When `subjectCode` is null the hook is idle and clears any previous result.
 * Changing `subjectCode` cancels any in-flight request and starts a fresh one.
 */
export function useStudentReport(
  subjectCode: string | null | undefined,
): UseStudentReportReturn {
  const [data, setData] = useState<StudentReportResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    // Abort any previous in-flight request
    abortRef.current?.abort();

    if (!subjectCode) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setData(null);
    setError(null);

    const params = new URLSearchParams({ subject_code: subjectCode });
    const url = `https://backlog-analyzer.onrender.com/student/report?${params}`;
    console.log("[useStudentReport] Fetching:", url);

    (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail ?? `Server returned HTTP ${res.status}`);
        }
        const raw = await res.json();

        // Parse qp_pattern out of report JSON if present
        let qp_pattern = "";
        const report = raw.report ?? "";
        try {
          const parsed = JSON.parse(report);
          if (typeof parsed === "object" && !Array.isArray(parsed)) {
            qp_pattern = parsed.qp_pattern ?? "";
            // Keep report as the full JSON string for the analysis page to parse topics
          }
        } catch { /* leave report as-is */ }

        const result: StudentReportResult = {
          subject_code: raw.subject_code,
          subject_name: raw.subject_name,
          report,
          qp_pattern,
          partial: raw.partial ?? false,
          created_at: raw.created_at ?? null,
          updated_at: raw.updated_at ?? null,
        };
        console.log("[useStudentReport] Success:", result.subject_code);
        setData(result);
      } catch (err) {
        const e = err as Error;
        if (e.name === "AbortError") {
          console.log("[useStudentReport] Request aborted cleanly.");
          return;
        }
        console.error("[useStudentReport] Fetch failed:", e.message);
        setError(e.message);
      } finally {
        setLoading(false);
      }
    })();

    return () => {
      controller.abort();
    };
  }, [subjectCode]);

  return { data, loading, error };
}
