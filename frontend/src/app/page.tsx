"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  BookOpen,
  Cpu,
  Eye,
  Loader2,
  PlayCircle,
  Trophy,
  AlertCircle,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";
import { supabase } from "@/lib/supabase";

// ── Backlog preparation status (Dynamic Progress Tracking) ──────────────────
type BacklogStatus = "Not Started" | "In Progress" | "Ready for Exam";

const STATUS_META: Record<BacklogStatus, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  "Not Started": {
    icon: <AlertCircle className="w-3 h-3" />,
    color: "text-zinc-500",
    bg: "bg-zinc-500/5",
    border: "border-zinc-500/10",
  },
  "In Progress": {
    icon: <PlayCircle className="w-3 h-3" />,
    color: "text-amber-400",
    bg: "bg-amber-500/5",
    border: "border-amber-500/20",
  },
  "Ready for Exam": {
    icon: <Trophy className="w-3 h-3" />,
    color: "text-emerald-400",
    bg: "bg-emerald-500/5",
    border: "border-emerald-500/20",
  },
};

const STATUS_CYCLE: BacklogStatus[] = ["Not Started", "In Progress", "Ready for Exam"];

// ── Interface for Student Profile fetched from Backend ─────────────────────
interface StudentProfile {
  regno: string;
  full_name: string | null;
  department: string | null;
  arrear_codes: string[]; // e.g., ['CS501', 'CS502'] — these are backlog subjects
}

// ── Authenticated Dashboard Component ──────────────────────────────────────
function Dashboard({
  displayName,
  registerNumber,
  role,
  userEmail,
}: {
  displayName: string | null;
  registerNumber: string | null;
  role: "student" | "professor" | null;
  userEmail: string | null;
}) {
  const router = useRouter();

  // 1. DYNAMIC DATA STATES
  const [profile, setProfile] = useState<StudentProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [arrearStatuses, setArrearStatuses] = useState<Record<string, BacklogStatus>>({});
  const [qpPatterns, setQpPatterns] = useState<Record<string, string>>({});
  const [subjectNames, setSubjectNames] = useState<Record<string, string>>({});

  // 2. TOGGLE PREPARATION STATUS
  const cycleStatus = useCallback((code: string) => {
    setArrearStatuses((prev) => {
      const current = prev[code] ?? "Not Started";
      const nextIdx = (STATUS_CYCLE.indexOf(current) + 1) % STATUS_CYCLE.length;
      return { ...prev, [code]: STATUS_CYCLE[nextIdx] as BacklogStatus };
    });
  }, []);

  // 3. FETCH STUDENT PROFILE (BACKLOG LIST) FROM BACKEND
  useEffect(() => {
    if (!userEmail) return;
    const encoded = encodeURIComponent(userEmail);
    fetch(`http://127.0.0.1:8000/student/profile/${encoded}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Profile not found for ${userEmail}`);
        return res.json() as Promise<StudentProfile>;
      })
      .then((data) => {
        setProfile(data);
        setArrearStatuses(Object.fromEntries(data.arrear_codes.map((c) => [c, "Not Started" as BacklogStatus])));
      })
      .catch((err: Error) => console.error("[Dashboard] Profile fetch failed:", err.message))
      .finally(() => setProfileLoading(false));
  }, [userEmail]);

  // 4. FETCH SUBJECT METADATA (NAMES & QP PATTERNS) DYNAMICALLY
  useEffect(() => {
    const codes = profile?.arrear_codes ?? [];
    if (codes.length === 0) return;

    const qpCache: Record<string, string> = {};
    const nameCache: Record<string, string> = {};

    // For every backlog code, fetch the faculty-approved report metadata
    Promise.allSettled(
      codes.map(async (code) => {
        try {
          const res = await fetch(`http://127.0.0.1:8000/student/report?subject_code=${code}`);
          if (!res.ok) return;
          const data = await res.json();
          if (data.subject_name) nameCache[code] = data.subject_name;
          const parsed = JSON.parse(data.report ?? "null");
          if (parsed?.qp_pattern) qpCache[code] = parsed.qp_pattern;
        } catch { /* Silent skip if subject not yet analyzed by professor */ }
      })
    ).then(() => {
      setQpPatterns(qpCache);
      setSubjectNames(nameCache);
    });
  }, [profile]);

  // DERIVED UI DATA
  const effectiveRegno = profile?.regno ?? registerNumber;
  const shortName = displayName?.split(" ")[0] ?? effectiveRegno ?? "Student";
  const visibleSubjects = (profile?.arrear_codes ?? []).map((code) => ({
    code,
    name: subjectNames[code] ?? `Subject ${code}`,
  }));

  // SYLLABUS HANDLER (Public Cloud Storage Access)
  const handleOpenSyllabus = async (code: string) => {
    const folder = `professor/${code}/syllabus`;
    const { data: files } = await supabase.storage.from("student-resources").list(folder, { limit: 1 });
    if (!files?.length) {
      alert("Faculty has not yet linked the syllabus for this course.");
      return;
    }
    const { data: urlData } = supabase.storage.from("student-resources").getPublicUrl(`${folder}/${files[0].name}`);
    window.open(urlData.publicUrl, "_blank");
  };

  return (
    <div className="flex min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <Sidebar displayName={displayName} registerNumber={effectiveRegno} role={role} />

      <div className="flex-1 pl-60">
        <header className="sticky top-0 z-10 border-b border-zinc-200/80 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
          <div className="px-7 h-13 flex items-center justify-between" style={{ height: '52px' }}>
            <div className="flex items-center gap-2">
              <Cpu className="w-4 h-4 text-emerald-400" />
              <span className="text-xs font-bold tracking-widest uppercase text-zinc-400 dark:text-zinc-500">Student Learning Portal</span>
            </div>
            <div className="flex items-center gap-3 bg-zinc-100 dark:bg-zinc-900 px-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-800">
              <span className="text-xs font-mono font-bold text-emerald-400 tracking-tighter">{effectiveRegno}</span>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)] animate-pulse" />
            </div>
          </div>
        </header>

        <main className="px-7 py-8 max-w-5xl">
          <div className="mb-8">
            <h1 className="text-2xl font-extrabold text-zinc-950 dark:text-white tracking-tight mb-2">
              Welcome back, <span className="text-emerald-400">{shortName}</span>
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-2xl leading-relaxed">
              You have <span className="text-zinc-900 dark:text-white font-bold">{visibleSubjects.length} backlogs</span> mapped to your academic profile. Focus on the Top 5 topics to optimize your exam preparation.
            </p>
          </div>

          {profileLoading && (
            <div className="flex items-center gap-3 py-6">
              <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
              <p className="text-sm text-zinc-400 dark:text-zinc-500 font-medium">Syncing with Sastra Academic Records...</p>
            </div>
          )}

          <section className="space-y-5">
            <h2 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-400 dark:text-zinc-600 flex items-center gap-2">
              <BookOpen className="w-3.5 h-3.5" /> Backlog Overview
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {visibleSubjects.map((subject) => {
                const status = arrearStatuses[subject.code] ?? "Not Started";
                const meta = STATUS_META[status];

                return (
                  <div key={subject.code} className="group relative rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/40 p-5 hover:border-emerald-500/30 transition-all duration-300 shadow-xl overflow-hidden">
                    <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/5 blur-[60px]" />

                    <div className="flex items-start justify-between mb-5">
                      <div>
                        <h3 className="text-base font-bold text-zinc-950 dark:text-white mb-0.5">{subject.name}</h3>
                        <p className="text-[10px] font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">{subject.code}</p>
                      </div>
                      <button onClick={() => cycleStatus(subject.code)} className={`flex items-center gap-1.5 rounded-full border ${meta.border} ${meta.bg} px-2.5 py-1 transition-all active:scale-95`}>
                        <div className={`${meta.color}`}>{meta.icon}</div>
                        <span className={`text-[9px] font-black uppercase tracking-tighter ${meta.color}`}>{status}</span>
                      </button>
                    </div>

                    <div className="bg-zinc-100/70 dark:bg-zinc-950/50 rounded-lg p-3 border border-zinc-200 dark:border-zinc-800/50 mb-4">
                      <p className="text-[9px] font-black text-violet-400 uppercase tracking-widest mb-1">Exam Pattern</p>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                        {qpPatterns[subject.code] || "Section A (10x2), Section B (15x4), Section C (20x1)"}
                      </p>
                    </div>

                    <div className="flex gap-2.5">
                      <button onClick={() => handleOpenSyllabus(subject.code)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg border border-sky-500/20 bg-sky-500/5 hover:bg-sky-500/10 text-xs font-bold text-sky-400 uppercase tracking-widest transition-all">
                        <Eye className="w-3.5 h-3.5" /> Syllabus
                      </button>
                      <button onClick={() => router.push(`/analysis/${subject.code}`)} className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold uppercase tracking-widest hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 transition-all active:scale-95">
                        <Cpu className="w-3.5 h-3.5" /> Analysis
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

// ── Root Export with Auth Protection ─────────────────────────────────────────
export default function Home() {
  const router = useRouter();
  const { user, registerNumber, role, loading } = useSupabaseAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!loading && user && role === "professor") router.replace("/professor");
  }, [loading, user, role, router]);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  if (!mounted || loading || !user || (user && role === "professor")) {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center gap-4">
        <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        <span className="text-zinc-400 dark:text-zinc-600 text-xs font-black uppercase tracking-widest">Verifying Sastra Identity</span>
      </div>
    );
  }



  return (
    <Dashboard
      displayName={(user?.user_metadata?.full_name as string) ?? null}
      registerNumber={registerNumber}
      role={role}
      userEmail={user?.email ?? null}
    />
  );
}