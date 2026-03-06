"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, BookOpen, Cpu, ExternalLink, Loader2, MessageSquare, Video, Sparkles, } from "lucide-react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { useStudentReport } from "@/hooks/useStudentReport";
import ChatSidebar from "@/components/ChatSidebar";

// ── Google Drive Portal (Placeholder for demonstration) ──────────────────
const PLACEHOLDER_LECTURE_URL = "https://drive.google.com/drive/folders/1FoYPMzwGYj9_7g_f9VsMv9d3DkL6Kxxx";

/**
 * REGEX PARSER: Extracts Topic Name, Source File, and Brief Description 
 * from the AI-generated string stored in the database.
 */
function parseTopicParts(raw: string): { name: string; source: string; brief: string } {
  const nameMatch = raw.match(/\*\*(.+?)\*\*/);
  const name = nameMatch ? nameMatch[1] : raw.replace(/^\d+\.\s*/, "").split(":")[0].trim();
  const sourceMatch = raw.match(/\(Source:\s*([^)]+)\)/i);
  const source = sourceMatch ? sourceMatch[1].trim() : "";
  const briefIdx = raw.indexOf("):");
  const brief = briefIdx !== -1 ? raw.slice(briefIdx + 2).trim().replace(/\.$/, "") : "";
  return { name, source, brief };
}

/**
 * STORAGE HANDLER: Resolves the public URL for a specific source file
 * via the backend (which uses the service-role key to bypass bucket RLS).
 * This works correctly regardless of whether the Supabase bucket is public
 * or private — fixing the "file not found" issue for new deployments.
 */
async function openSourceFile(subjectCode: string, sourceName: string) {
  if (!sourceName) {
    alert("No source file information available for this topic.");
    return;
  }
  try {
    const params = new URLSearchParams({ subject_code: subjectCode, source_name: sourceName });
    const res = await fetch(`https://backlog-analyzer.onrender.com/student/file-url?${params}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      alert(body.detail ?? `The source file "${sourceName}" could not be found.`);
      return;
    }
    const { url } = await res.json();
    window.open(url, "_blank", "noopener,noreferrer");
  } catch {
    alert(`Could not reach the server to retrieve "${sourceName}". Please try again.`);
  }
}

export default function AnalysisPage() {
  const router = useRouter();
  const params = useParams();
  const subjectCode = typeof params.subjectCode === "string" ? params.subjectCode.toUpperCase() : null;
  const { user, loading: authLoading, role } = useSupabaseAuth();
  const [mounted, setMounted] = useState(false);

  // 1. HYDRATION GUARD: Ensures server-side and client-side HTML matches perfectly
  useEffect(() => { setMounted(true); }, []);

  // 2. AUTH & ROLE GUARD: Prevents faculty from accessing student-only views
  useEffect(() => {
    if (authLoading || !mounted) return;
    if (!user) { router.replace("/"); return; }
    if (role === "professor") { router.replace("/professor"); return; }
  }, [authLoading, user, role, router, mounted]);

  // 3. DATA FETCHING: Retrieves analysis and QP pattern strictly by subjectCode
  const { data, loading, error } = useStudentReport(subjectCode);
  const [chatTopic, setChatTopic] = useState<string | null>(null);

  // 4. TOPIC RESOLUTION: Parses the JSON payload into an iterable list
  const topics: string[] = (() => {
    if (!data?.report) return [];
    try {
      const parsed = JSON.parse(data.report);
      if (typeof parsed === "object" && !Array.isArray(parsed)) return Array.isArray(parsed.topics) ? parsed.topics : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return [data.report]; }
  })();

  const qpPattern: string = data?.qp_pattern ?? "";

  // DYNAMIC LABELING: Falls back to code if name isn't in the database row yet
  const subjectName = data?.subject_name ?? subjectCode ?? "Subject Analysis";

  if (authLoading || !mounted) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans selection:bg-emerald-500/30">
      <header className="sticky top-0 z-30 border-b border-zinc-200/80 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
        <div className="max-w-4xl mx-auto px-6 h-16 flex items-center justify-between">
          <button onClick={() => router.back()} className="group flex items-center gap-2 text-sm text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-all">
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            Back to Dashboard
          </button>
          <div className="hidden sm:flex items-center gap-3 px-4 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800">
            <BookOpen className="w-4 h-4 text-emerald-400" />
            <span className="text-sm font-bold tracking-wide">{subjectName}</span>
            <span className="text-xs font-mono text-zinc-500">{subjectCode}</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-bold uppercase tracking-tighter text-zinc-500">Live Analysis</span>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-8">
        <div className="relative mb-8">
          <div className="absolute -left-4 top-0 w-1 h-8 bg-emerald-500 rounded-full" />
          <h1 className="text-2xl font-extrabold text-zinc-950 dark:text-white tracking-tight mb-2">
            Top 5 <span className="text-emerald-400">Essential</span> Topics
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
            AI-synthesized from official faculty resources for {subjectName}. Prioritize these for the upcoming exams.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            {data?.created_at && (
              <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-4 py-1.5 shadow-lg shadow-emerald-500/5">
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">
                  Updated {new Date(data.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </span>
              </div>
            )}
            {qpPattern && (
              <div className="flex items-center gap-2 rounded-full border border-violet-500/20 bg-violet-500/10 px-4 py-1.5">
                <span className="text-[10px] font-black uppercase text-violet-400">Pattern</span>
                <span className="text-xs font-medium text-violet-600 dark:text-violet-200">{qpPattern}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Dynamic Rendering Logic ── */}
        {loading && (
          <div className="flex flex-col items-center gap-4 py-24">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-500" />
            <p className="text-base text-zinc-400 font-medium animate-pulse">Fetching Faculty Insights...</p>
          </div>
        )}

        {!loading && error && (
          <div className="rounded-2xl border-2 border-dashed border-red-500/20 bg-red-500/5 p-12 text-center">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Analysis Pending</h3>
            <p className="text-zinc-400 max-w-sm mx-auto leading-relaxed">
              The professor has not yet finalized the study roadmap for this course code.
            </p>
          </div>
        )}

        {!loading && !error && topics.length > 0 && (
          <div className="grid gap-6">
            {topics.map((raw, idx) => {
              const { name, source, brief } = parseTopicParts(raw);
              return (
                <div key={idx} className="group relative rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-900 hover:border-zinc-300 dark:hover:border-emerald-500/30 transition-all duration-300 p-5 shadow-xl overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/5 blur-[60px] group-hover:bg-emerald-500/10 transition-colors" />

                  <div className="flex items-start gap-5 relative z-10">
                    <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 dark:text-emerald-400 font-black text-lg shrink-0">
                      {idx + 1}
                    </div>
                    <div className="flex-1">
                      <h3 className="text-xl font-bold text-zinc-950 dark:text-white mb-3 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">{name}</h3>
                      {brief && <p className="text-base text-zinc-500 dark:text-zinc-400 leading-relaxed mb-6">{brief}</p>}

                      <div className="flex flex-wrap items-center gap-3 pt-5 border-t border-zinc-200 dark:border-zinc-800/50">
                        <a href={PLACEHOLDER_LECTURE_URL} target="_blank" rel="noopener" className="flex items-center gap-2 rounded-xl border border-sky-500/20 bg-sky-500/5 hover:bg-sky-500/10 px-4 py-2 text-xs font-bold text-sky-500 dark:text-sky-400 uppercase tracking-tight transition-all active:scale-95">
                          <Video className="w-4 h-4" /> Video Lecture
                        </a>
                        <button onClick={() => setChatTopic(name)} className="flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-500 dark:text-emerald-400 uppercase tracking-tight transition-all active:scale-95">
                          <MessageSquare className="w-4 h-4" /> Ask AI Tutor
                        </button>
                        {source && (
                          <button onClick={() => openSourceFile(subjectCode ?? "", source)} className="flex items-center gap-2 rounded-xl border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 px-4 py-2 text-xs font-bold text-violet-500 dark:text-violet-400 uppercase tracking-tight transition-all active:scale-95">
                            <ExternalLink className="w-4 h-4" /> Open Professor Notes
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <footer className="mt-20 pt-8 border-t border-zinc-200 dark:border-zinc-900 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 opacity-40 hover:opacity-100 transition-opacity">
            <Cpu className="w-5 h-5 text-emerald-500" />
            <span className="text-sm font-black uppercase tracking-[0.2em] text-zinc-400">Intelligent Backlog Analyzer</span>
          </div>
          <div className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">
            SASTRA CSE · V1.0 · 2026
          </div>
        </footer>
      </main>

      {/* ── AI Tutor Modal ── */}
      {chatTopic && (
        <>
          <div className="fixed inset-0 z-40 bg-zinc-950/60 backdrop-blur-md animate-in fade-in duration-300" onClick={() => setChatTopic(null)} />
          <ChatSidebar subjectCode={subjectCode ?? ""} topicName={chatTopic} onClose={() => setChatTopic(null)} />
        </>
      )}
    </div>
  );
}