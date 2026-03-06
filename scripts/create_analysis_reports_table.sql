-- ============================================================
-- Run this ONCE in your Supabase SQL Editor to create the
-- analysis_reports table that stores professor-generated reports.
-- Dashboard -> SQL Editor -> Paste -> Run
-- ============================================================

CREATE TABLE IF NOT EXISTS public.analysis_reports (
    id              uuid            DEFAULT gen_random_uuid() PRIMARY KEY,
    subject_code    text            NOT NULL,
    subject_name    text            NOT NULL,
    professor_email text            NOT NULL,
    report_markdown text            NOT NULL,
    partial         boolean         NOT NULL DEFAULT false,
    created_at      timestamptz     NOT NULL DEFAULT now(),
    updated_at      timestamptz     NOT NULL DEFAULT now()
);

-- Unique constraint so upsert-on-conflict works per subject
ALTER TABLE public.analysis_reports
    DROP CONSTRAINT IF EXISTS analysis_reports_subject_code_key;
ALTER TABLE public.analysis_reports
    ADD CONSTRAINT analysis_reports_subject_code_key UNIQUE (subject_code);

-- Auto-update updated_at on every UPDATE
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_analysis_reports_updated_at ON public.analysis_reports;
CREATE TRIGGER trg_analysis_reports_updated_at
    BEFORE UPDATE ON public.analysis_reports
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── Row-Level Security ───────────────────────────────────────────────────────
ALTER TABLE public.analysis_reports ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) can read reports — students need to read them
DROP POLICY IF EXISTS "Public read reports" ON public.analysis_reports;
CREATE POLICY "Public read reports"
    ON public.analysis_reports FOR SELECT
    USING (true);

-- Only service-role (backend) may insert / update / delete
-- (No separate write policy needed — service_role bypasses RLS entirely)
