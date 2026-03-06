"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  Cpu,
  GraduationCap,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  User,
  Sparkles,
  Users,
  BookMarked,
  X,
} from "lucide-react";
import Sidebar from "@/components/Sidebar";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";



interface StoredReport {
  subject_code: string;
  subject_name: string;
  professor_email: string;
  partial: boolean;
  updated_at: string;
}

interface SubjectActionState {
  syllabusFiles: File[];
  notesFiles: File[];
  saving: boolean;
  done: boolean;
  topics: string[] | null;
  qp_pattern: string;
  error: string | null;
  elapsed: number;
}

interface AllStudent {
  regno: string;
  email: string;
  full_name: string | null;
  department: string | null;
  arrear_codes: string[];
}

function emptyActionState(): SubjectActionState {
  return { syllabusFiles: [], notesFiles: [], saving: false, done: false, topics: null, qp_pattern: "", error: null, elapsed: 0 };
}

function parseTopicName(raw: string): string {
  const match = raw.match(/\*\*(.+?)\*\*/);
  return match ? match[1] : raw.replace(/^\d+\.\s*/, "").split(":")[0].trim();
}

function phaseLabel(secs: number) {
  if (secs < 10) return "Initialising Cloud Storage sync...";
  if (secs < 60) return "Running OCR & Document Parsing...";
  if (secs < 120) return "Synthesising Context for Gemini AI...";
  return "Finalising study guide extraction...";
}

export default function ProfessorPage() {
  const router = useRouter();
  const { user, loading: authLoading, role, subjectCode } = useSupabaseAuth();
  const professorEmail = user?.email ?? "";
  const displayName = (user?.user_metadata?.full_name as string | undefined) ?? null;
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (authLoading || !mounted) return;
    if (!user) { router.replace("/"); return; }
    if (role === "student") { router.replace("/"); return; }
  }, [authLoading, user, role, router, mounted]);

  const [storedReports, setStoredReports] = useState<StoredReport[]>([]);
  const [reportsLoading, setReportsLoading] = useState(true);

  // ── Students linked to this professor ──────────────────────────────────
  interface LinkedStudent {
    regno: string;
    email: string;
    full_name: string | null;
    department: string | null;
    arrear_codes: string[];
  }
  const [linkedStudents, setLinkedStudents] = useState<LinkedStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState<string | null>(null);

  // ── Add Subject Modal state ─────────────────────────────────────────────
  const [showAddSubject, setShowAddSubject] = useState(false);
  const [addForm, setAddForm] = useState({ name: "", code: "" });
  const [allStudents, setAllStudents] = useState<AllStudent[]>([]);
  const [allStudentsLoading, setAllStudentsLoading] = useState(false);
  const [selectedRegnos, setSelectedRegnos] = useState<Set<string>>(new Set());
  const [studentSearch, setStudentSearch] = useState("");
  const [addSubjectSaving, setAddSubjectSaving] = useState(false);
  const [addSubjectError, setAddSubjectError] = useState<string | null>(null);

  useEffect(() => {
    if (!professorEmail) return;
    (async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/professor/reports?professor_email=${encodeURIComponent(professorEmail)}`);
        if (res.ok) {
          const json = await res.json();
          setStoredReports(json.reports ?? []);
        }
      } catch { }
      finally { setReportsLoading(false); }
    })();
  }, [professorEmail]);

  // Fetch linked students
  useEffect(() => {
    if (!professorEmail) return;
    (async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/professor/students?professor_email=${encodeURIComponent(professorEmail)}`);
        if (res.ok) {
          const json = await res.json();
          setLinkedStudents(json.students ?? []);
        } else {
          setStudentsError("Could not load students.");
        }
      } catch { setStudentsError("Network error."); }
      finally { setStudentsLoading(false); }
    })();
  }, [professorEmail]);

  // actionStates keyed by subject code — initialised lazily once subjectCode is known
  const [actionStates, setActionStates] = useState<Record<string, SubjectActionState>>({});

  useEffect(() => {
    if (!subjectCode) return;
    setActionStates((prev) => {
      if (prev[subjectCode]) return prev; // already initialised
      return { ...prev, [subjectCode]: emptyActionState() };
    });
  }, [subjectCode]);

  // Ensure all storedReports subjects have actionStates
  useEffect(() => {
    storedReports.forEach((r) => {
      setActionStates((prev) => {
        if (prev[r.subject_code]) return prev;
        return { ...prev, [r.subject_code]: emptyActionState() };
      });
    });
  }, [storedReports]);

  const timerRefs = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  if (!mounted || authLoading || !user || role === "student") {
    return (
      <div className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
      </div>
    );
  }

  // Build the all-subjects list: storedReports + auth-assigned subject (if not already listed)
  const allSubjects: Array<{ code: string; name: string }> = [
    ...storedReports.map((r) => ({ code: r.subject_code, name: r.subject_name })),
    ...(subjectCode && !storedReports.some((r) => r.subject_code === subjectCode)
      ? [{ code: subjectCode, name: `Subject ${subjectCode}` }]
      : []),
  ];

  // ── File handlers ──────────────────────────────────────────────────────
  const handleSyllabusFiles = (code: string, files: FileList | null) => {
    if (!files) return;
    setActionStates((prev) => {
      const existing = prev[code]?.syllabusFiles ?? [];
      const incoming = Array.from(files);
      const merged = [...existing, ...incoming.filter((f) => !existing.some((e) => e.name === f.name))];
      return { ...prev, [code]: { ...(prev[code] ?? emptyActionState()), syllabusFiles: merged } };
    });
  };

  const handleNotesFiles = (code: string, files: FileList | null) => {
    if (!files) return;
    setActionStates((prev) => {
      const existing = prev[code]?.notesFiles ?? [];
      const incoming = Array.from(files);
      const merged = [...existing, ...incoming.filter((f) => !existing.some((e) => e.name === f.name))];
      return { ...prev, [code]: { ...(prev[code] ?? emptyActionState()), notesFiles: merged } };
    });
  };

  const removeSyllabusFile = (code: string, fileName: string) => {
    setActionStates((prev) => ({
      ...prev,
      [code]: { ...prev[code], syllabusFiles: prev[code].syllabusFiles.filter((f) => f.name !== fileName) },
    }));
  };

  const removeNotesFile = (code: string, fileName: string) => {
    setActionStates((prev) => ({
      ...prev,
      [code]: { ...prev[code], notesFiles: prev[code].notesFiles.filter((f) => f.name !== fileName) },
    }));
  };

  const clearFiles = (code: string, slot: "syllabus" | "notes") => {
    setActionStates((prev) => ({
      ...prev,
      [code]: {
        ...prev[code],
        syllabusFiles: slot === "syllabus" ? [] : prev[code].syllabusFiles,
        notesFiles: slot === "notes" ? [] : prev[code].notesFiles,
      },
    }));
  };

  const handleUpdateMaterial = async (code: string, name: string) => {
    const state = actionStates[code];
    const allFiles = [...state.syllabusFiles, ...state.notesFiles];
    if (!allFiles.length) return;

    setActionStates((prev) => ({ ...prev, [code]: { ...prev[code], saving: true, done: false, topics: null, error: null, elapsed: 0 } }));
    timerRefs.current[code] = setInterval(() => {
      setActionStates((prev) => ({ ...prev, [code]: { ...prev[code], elapsed: prev[code].elapsed + 1 } }));
    }, 1000);

    const fd = new FormData();
    fd.append("subject_code", code);
    fd.append("subject_name", name);
    fd.append("professor_email", professorEmail);
    for (const f of state.syllabusFiles) fd.append("syllabus_files", f);
    for (const f of state.notesFiles) fd.append("notes_files", f);

    try {
      const res = await fetch("http://127.0.0.1:8000/professor/analyze-and-save", { method: "POST", body: fd });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? `HTTP ${res.status}`);
      setActionStates((prev) => ({
        ...prev,
        [code]: { ...prev[code], saving: false, done: true, topics: body.top_topics ?? [], qp_pattern: body.qp_pattern ?? "", error: null },
      }));
      setStoredReports((prev) => [
        ...prev.filter((r) => r.subject_code !== code),
        { subject_code: code, subject_name: name, professor_email: professorEmail, partial: false, updated_at: new Date().toISOString() },
      ]);
    } catch (e) {
      setActionStates((prev) => ({ ...prev, [code]: { ...prev[code], saving: false, error: (e as Error).message } }));
    } finally { clearInterval(timerRefs.current[code]); }
  };

  const handleReset = async (code: string, name: string) => {
    if (!window.confirm(`Reset "${name}"? This will delete all uploaded materials and analysis.`)) return;
    try {
      const res = await fetch(
        `http://127.0.0.1:8000/professor/reset/${encodeURIComponent(code)}?professor_email=${encodeURIComponent(professorEmail)}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Reset failed");
      setStoredReports((prev) => prev.filter((r) => r.subject_code !== code));
      setActionStates((prev) => ({ ...prev, [code]: emptyActionState() }));
    } catch (e) { alert((e as Error).message); }
  };

  const storedFor = (code: string): StoredReport | undefined => storedReports.find((r) => r.subject_code === code);

  // ── Add Subject modal handlers ──────────────────────────────────────────
  const openAddSubject = async () => {
    setAddForm({ name: "", code: "" });
    setSelectedRegnos(new Set());
    setStudentSearch("");
    setAddSubjectError(null);
    setShowAddSubject(true);
    setAllStudentsLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/professor/all-students");
      if (res.ok) {
        const json = await res.json();
        setAllStudents(json.students ?? []);
      }
    } catch { }
    finally { setAllStudentsLoading(false); }
  };

  const toggleStudent = (regno: string) => {
    setSelectedRegnos((prev) => {
      const next = new Set(prev);
      if (next.has(regno)) next.delete(regno); else next.add(regno);
      return next;
    });
  };

  const handleCreateSubject = async () => {
    if (!addForm.name.trim() || !addForm.code.trim()) {
      setAddSubjectError("Subject name and code are required.");
      return;
    }
    setAddSubjectSaving(true);
    setAddSubjectError(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/professor/create-subject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_code: addForm.code.trim().toUpperCase(),
          subject_name: addForm.name.trim(),
          professor_email: professorEmail,
          student_regnos: Array.from(selectedRegnos),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.detail ?? `HTTP ${res.status}`);
      // Refresh reports list and close modal
      const rRes = await fetch(`http://127.0.0.1:8000/professor/reports?professor_email=${encodeURIComponent(professorEmail)}`);
      if (rRes.ok) {
        const rJson = await rRes.json();
        setStoredReports(rJson.reports ?? []);
      }
      setShowAddSubject(false);
    } catch (e) {
      setAddSubjectError((e as Error).message);
    } finally {
      setAddSubjectSaving(false);
    }
  };

  const filteredStudents = allStudents.filter((s) => {
    const q = studentSearch.toLowerCase();
    return (
      s.regno.toLowerCase().includes(q) ||
      (s.full_name ?? "").toLowerCase().includes(q) ||
      (s.department ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex min-h-screen bg-white dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 font-sans">
      <Sidebar displayName={displayName} registerNumber={null} role="professor" />

      {/* ── Add Subject Modal ──────────────────────────────────────────── */}
      {showAddSubject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowAddSubject(false)} />
          <div className="relative z-10 w-full max-w-2xl mx-4 rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <BookMarked className="w-4 h-4 text-violet-400" />
                </div>
                <div>
                  <p className="text-sm font-bold text-zinc-900 dark:text-white">Add New Subject</p>
                  <p className="text-[11px] text-zinc-500">Create a subject and assign students to it</p>
                </div>
              </div>
              <button onClick={() => setShowAddSubject(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-colors text-zinc-500">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1">
              {/* Subject Name & Code */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Subject Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Data Structures"
                    value={addForm.name}
                    onChange={(e) => setAddForm((p) => ({ ...p, name: e.target.value }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500">Subject Code</label>
                  <input
                    type="text"
                    placeholder="e.g. CS501"
                    value={addForm.code}
                    onChange={(e) => setAddForm((p) => ({ ...p, code: e.target.value.toUpperCase() }))}
                    className="w-full px-3 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm font-mono text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500/50"
                  />
                </div>
              </div>

              {/* Student Selector */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                    <Users className="w-3.5 h-3.5" /> Assign Students
                  </label>
                  <span className="text-[10px] text-violet-400 font-bold">{selectedRegnos.size} selected</span>
                </div>

                {/* Search bar */}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="Search by name, reg no, or department…"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-2 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-950 text-sm text-zinc-900 dark:text-white placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                  />
                </div>

                {/* Student list */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 overflow-hidden max-h-56 overflow-y-auto">
                  {allStudentsLoading ? (
                    <div className="flex items-center gap-3 px-4 py-6 text-sm text-zinc-500">
                      <Loader2 className="w-4 h-4 animate-spin text-violet-400" /> Loading students…
                    </div>
                  ) : filteredStudents.length === 0 ? (
                    <div className="px-4 py-6 text-sm text-zinc-500 text-center">No students found.</div>
                  ) : (
                    filteredStudents.map((stu) => {
                      const selected = selectedRegnos.has(stu.regno);
                      return (
                        <button
                          key={stu.regno}
                          onClick={() => toggleStudent(stu.regno)}
                          className={`w-full flex items-center gap-3 px-4 py-3 border-b border-zinc-100 dark:border-zinc-800/50 last:border-0 transition-colors text-left ${selected ? "bg-violet-500/10" : "hover:bg-zinc-50 dark:hover:bg-zinc-800/50"}`}
                        >
                          <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-all ${selected ? "bg-violet-500 border-violet-500" : "border-zinc-300 dark:border-zinc-600"}`}>
                            {selected && (
                              <svg className="w-3 h-3 text-white" viewBox="0 0 12 12" fill="none">
                                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                              </svg>
                            )}
                          </div>
                          <div className="w-7 h-7 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                            <User className="w-3.5 h-3.5 text-violet-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-zinc-800 dark:text-zinc-200 truncate">{stu.full_name ?? "—"}</p>
                            <p className="text-[10px] font-mono text-zinc-400">{stu.regno} · {stu.department ?? "—"}</p>
                          </div>
                          <div className="shrink-0 flex flex-wrap gap-1 max-w-[120px] justify-end">
                            {(stu.arrear_codes ?? []).slice(0, 2).map((c) => (
                              <span key={c} className="text-[9px] font-bold rounded-full border border-zinc-300 dark:border-zinc-700 px-1.5 py-0.5 text-zinc-500">{c}</span>
                            ))}
                            {(stu.arrear_codes ?? []).length > 2 && (
                              <span className="text-[9px] text-zinc-400">+{(stu.arrear_codes ?? []).length - 2}</span>
                            )}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>

              {addSubjectError && (
                <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-2.5 text-xs text-red-400">{addSubjectError}</div>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 shrink-0">
              <button onClick={() => setShowAddSubject(false)} className="px-4 py-2 rounded-lg text-sm font-bold text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleCreateSubject}
                disabled={addSubjectSaving || !addForm.name.trim() || !addForm.code.trim()}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-bold transition-all shadow-lg shadow-violet-600/20 active:scale-95"
              >
                {addSubjectSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                {addSubjectSaving ? "Creating…" : "Create Subject"}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 pl-60">
        <header className="sticky top-0 z-30 border-b border-zinc-200/80 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-xl">
          <div className="px-7 flex items-center justify-between" style={{ height: "52px" }}>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <GraduationCap className="w-4 h-4 text-violet-400" />
              </div>
              <span className="text-xs font-bold tracking-widest uppercase text-violet-300">Faculty Management Portal</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-3 bg-zinc-100 dark:bg-zinc-900 px-3 py-1 rounded-full border border-zinc-200 dark:border-zinc-800">
                <span className="text-[11px] font-mono text-zinc-500">{professorEmail}</span>
                <div className="w-1.5 h-1.5 rounded-full bg-violet-500 shadow-[0_0_8px_rgba(139,92,246,0.5)]" />
              </div>
              <button
                onClick={openAddSubject}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold transition-all shadow-lg shadow-violet-600/20 active:scale-95"
              >
                <Plus className="w-3.5 h-3.5" /> Add Subject
              </button>
            </div>
          </div>
        </header>

        <main className="px-7 py-7 max-w-5xl">
          <div className="mb-7">
            <h1 className="text-2xl font-extrabold text-zinc-950 dark:text-white tracking-tight mb-1.5">
              Welcome, <span>{displayName}</span>
            </h1>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-3xl leading-relaxed">
              Curate and validate the study roadmap for your subjects. Uploaded materials are processed by AI to generate high-probability exam topics for students.
            </p>
          </div>

          {/* ── Course-Specific Analysis Banner ──────────────────────────── */}
          <div className="mb-7 p-5 rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 shadow-2xl relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-48 h-48 bg-violet-500/5 blur-[80px] group-hover:bg-violet-500/10 transition-colors" />
            <div className="relative flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                  <BookMarked className="w-5 h-5 text-violet-400" />
                </div>
                <div>
                  <p className="text-xs font-bold text-zinc-600 dark:text-zinc-300 uppercase tracking-wider mb-0.5">Course-Specific Analysis</p>
                  <p className="text-[12px] text-zinc-400 dark:text-zinc-500">
                    Uploaded materials are keyed strictly by <span className="text-zinc-700 dark:text-zinc-200 font-bold">Course Code</span>. All students access the same Faculty Validated Material.
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-8">
            {/* ── My Students Panel ─────────────────────────────────────── */}
            <div>
              <h2 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-400 dark:text-zinc-600 flex items-center gap-3 mb-6">
                <Users className="w-4 h-4" /> My Students
                <span className="ml-auto text-[10px] font-normal normal-case tracking-normal text-zinc-400 dark:text-zinc-700">
                  {!studentsLoading && `${linkedStudents.length} enrolled`}
                </span>
              </h2>

              {studentsLoading ? (
                <div className="flex items-center gap-3 text-sm text-zinc-500 py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                  Loading students…
                </div>
              ) : studentsError ? (
                <div className="rounded-xl border border-red-500/20 bg-red-500/5 px-5 py-4 text-xs text-red-400">
                  {studentsError}
                </div>
              ) : linkedStudents.length === 0 ? (
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/40 px-5 py-8 text-center">
                  <Users className="w-8 h-8 text-zinc-300 dark:text-zinc-700 mx-auto mb-3" />
                  <p className="text-sm text-zinc-400 dark:text-zinc-500">No students linked yet.</p>
                </div>
              ) : (
                <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 overflow-hidden">
                  {/* Header row */}
                  <div className="grid grid-cols-12 gap-4 px-6 py-3 bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">
                    <span className="col-span-2">Reg. No.</span>
                    <span className="col-span-3">Name</span>
                    <span className="col-span-2">Dept</span>
                    <span className="col-span-5">Backlogs</span>
                  </div>
                  {linkedStudents.map((stu, idx) => (
                    <div
                      key={stu.regno}
                      className={`grid grid-cols-12 gap-4 px-6 py-4 items-center text-sm border-b border-zinc-200/50 dark:border-zinc-800/50 last:border-0 hover:bg-zinc-100 dark:hover:bg-zinc-900 transition-colors ${idx % 2 === 0 ? "bg-zinc-50/50 dark:bg-zinc-950/30" : ""}`}
                    >
                      <div className="col-span-2">
                        <span className="font-mono text-xs font-bold text-violet-300">{stu.regno}</span>
                      </div>
                      <div className="col-span-3 flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-violet-500/10 border border-violet-500/20 flex items-center justify-center shrink-0">
                          <User className="w-3.5 h-3.5 text-violet-400" />
                        </div>
                        <span className="text-xs text-zinc-500 dark:text-zinc-300 truncate">{stu.full_name ?? "—"}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="flex items-center gap-1 text-[10px] font-bold text-zinc-500 uppercase">
                          <GraduationCap className="w-3 h-3" />{stu.department ?? "CSE"}
                        </span>
                      </div>
                      <div className="col-span-5 flex flex-wrap gap-1.5">
                        {stu.arrear_codes.length === 0 ? (
                          <span className="text-xs text-zinc-700 italic">No backlogs</span>
                        ) : stu.arrear_codes.map((code) => (
                          <span
                            key={code}
                            className="inline-flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/10 px-2 py-0.5 text-[10px] font-bold text-violet-300"
                          >
                            <BookMarked className="w-2.5 h-2.5" />{code}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Curriculum Ingestion ─────────────────────────────────── */}
            <div>
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xs font-black uppercase tracking-[0.3em] text-zinc-400 dark:text-zinc-600 flex items-center gap-3">
                  <BookOpen className="w-4 h-4" /> Curriculum Ingestion
                </h2>
                <button
                  onClick={openAddSubject}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-violet-500/30 bg-violet-500/5 hover:bg-violet-500/10 text-violet-400 text-xs font-bold transition-all"
                >
                  <Plus className="w-3.5 h-3.5" /> Add Subject
                </button>
              </div>

              {reportsLoading ? (
                <div className="flex items-center gap-3 text-sm text-zinc-500 py-4">
                  <Loader2 className="w-4 h-4 animate-spin text-violet-400" /> Loading subjects…
                </div>
              ) : allSubjects.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-900/30 px-8 py-12 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center mx-auto">
                    <BookOpen className="w-6 h-6 text-violet-400" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-zinc-700 dark:text-zinc-300 mb-1">No Subjects Yet</p>
                    <p className="text-xs text-zinc-500">Click <span className="text-violet-400 font-bold">Add Subject</span> to create your first course and assign students.</p>
                  </div>
                  <button
                    onClick={openAddSubject}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-xs font-bold shadow-lg shadow-violet-600/20 transition-all active:scale-95 mx-auto"
                  >
                    <Plus className="w-4 h-4" /> Add Your First Subject
                  </button>
                </div>
              ) : (
                <div className="space-y-6">
                  {allSubjects.map((subject) => {
                    const stored = storedFor(subject.code);
                    const as_ = actionStates[subject.code] ?? emptyActionState();
                    const filesReady = as_.syllabusFiles.length > 0 || as_.notesFiles.length > 0;

                    return (
                      <div key={subject.code} className="group rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 hover:bg-zinc-50 dark:hover:bg-zinc-900 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all duration-300 overflow-hidden shadow-xl">
                        {/* Subject header */}
                        <div className="px-8 py-5 border-b border-zinc-200 dark:border-zinc-800/50 flex items-center justify-between bg-zinc-50 dark:bg-zinc-900/50">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 flex items-center justify-center font-black text-xs text-zinc-500 dark:text-zinc-400">
                              {subject.code.slice(-2)}
                            </div>
                            <div>
                              <p className="text-xl font-bold text-zinc-950 dark:text-white tracking-tight">{subject.name}</p>
                              <p className="text-xs font-mono text-zinc-400 dark:text-zinc-600 uppercase tracking-widest">{subject.code}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {as_.saving ? (
                              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-[10px] font-black uppercase text-amber-500 animate-pulse">
                                <Loader2 className="w-3 h-3 animate-spin" /> Neural Processing
                              </div>
                            ) : stored && !stored.partial ? (
                              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-[10px] font-black uppercase text-emerald-500">
                                <CheckCircle2 className="w-3 h-3" /> Validated
                              </div>
                            ) : (
                              <div className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 text-[10px] font-black uppercase text-zinc-400 dark:text-zinc-600">
                                {stored?.partial ? "Awaiting Material" : "Pending Setup"}
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="p-8 grid grid-cols-1 lg:grid-cols-2 gap-10">
                          {/* ── Left: File Upload ─────────────────────── */}
                          <div className="space-y-8">
                            {/* Syllabus upload */}
                            <div className="space-y-3">
                              <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-violet-500" /> Faculty Syllabus
                              </label>
                              <div className="relative group/upload">
                                <input
                                  type="file"
                                  multiple
                                  accept=".png,.jpg,.jpeg,.pdf,.docx"
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                  onChange={(e) => handleSyllabusFiles(subject.code, e.target.files)}
                                />
                                <div className="rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-5 flex flex-col items-center justify-center gap-2 group-hover/upload:border-violet-500/30 transition-all">
                                  <Upload className="w-5 h-5 text-zinc-400 dark:text-zinc-700 group-hover/upload:text-violet-400 transition-colors" />
                                  <p className="text-xs font-bold text-zinc-500">Drop PDF or Word files or Image</p>
                                </div>
                              </div>
                              {/* Syllabus file name chips */}
                              {as_.syllabusFiles.length > 0 && (
                                <div className="space-y-1.5">
                                  {as_.syllabusFiles.map((f) => (
                                    <div key={f.name} className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/5 px-3 py-1.5">
                                      <BookMarked className="w-3 h-3 text-violet-400 shrink-0" />
                                      <span className="flex-1 text-xs text-violet-300 truncate font-mono">{f.name}</span>
                                      <span className="text-[9px] text-zinc-500 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                                      <button
                                        onClick={() => removeSyllabusFile(subject.code, f.name)}
                                        className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => clearFiles(subject.code, "syllabus")}
                                    className="text-[10px] font-bold text-zinc-500 hover:text-red-400 flex items-center gap-1 px-1 transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" /> Clear all
                                  </button>
                                </div>
                              )}
                            </div>

                            {/* Notes upload */}
                            <div className="space-y-3">
                              <label className="text-[11px] font-black uppercase tracking-widest text-zinc-500 flex items-center gap-2">
                                <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Reference Material
                              </label>
                              <div className="relative group/upload">
                                <input
                                  type="file"
                                  multiple
                                  accept=".pdf,.docx,.pptx,.jpg,.jpeg,.png"
                                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                                  onChange={(e) => handleNotesFiles(subject.code, e.target.files)}
                                />
                                <div className="rounded-xl border-2 border-dashed border-zinc-300 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-5 flex flex-col items-center justify-center gap-2 group-hover/upload:border-emerald-500/30 transition-all">
                                  <Upload className="w-5 h-5 text-zinc-400 dark:text-zinc-700 group-hover/upload:text-emerald-400 transition-colors" />
                                  <p className="text-xs font-bold text-zinc-500">Drop Notes, Slides, or Images</p>
                                </div>
                              </div>
                              {/* Notes file name chips */}
                              {as_.notesFiles.length > 0 && (
                                <div className="space-y-1.5">
                                  {as_.notesFiles.map((f) => (
                                    <div key={f.name} className="flex items-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-1.5">
                                      <BookOpen className="w-3 h-3 text-emerald-400 shrink-0" />
                                      <span className="flex-1 text-xs text-emerald-300 truncate font-mono">{f.name}</span>
                                      <span className="text-[9px] text-zinc-500 shrink-0">{(f.size / 1024).toFixed(0)} KB</span>
                                      <button
                                        onClick={() => removeNotesFile(subject.code, f.name)}
                                        className="w-4 h-4 flex items-center justify-center rounded-full hover:bg-red-500/20 text-zinc-500 hover:text-red-400 transition-colors shrink-0"
                                      >
                                        <X className="w-3 h-3" />
                                      </button>
                                    </div>
                                  ))}
                                  <button
                                    onClick={() => clearFiles(subject.code, "notes")}
                                    className="text-[10px] font-bold text-zinc-500 hover:text-red-400 flex items-center gap-1 px-1 transition-colors"
                                  >
                                    <Trash2 className="w-3 h-3" /> Clear all
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* ── Right: AI Status + Actions ───────────── */}
                          <div className="flex flex-col justify-between h-full space-y-6">
                            <div className="flex-1 rounded-2xl bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/50 p-6 relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1 h-full bg-zinc-200 dark:bg-zinc-800" />
                              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-600 mb-4">Real-time AI Status</h4>

                              {as_.saving ? (
                                <div className="space-y-6">
                                  <div className="flex items-center gap-3">
                                    <Loader2 className="w-5 h-5 text-amber-500 animate-spin" />
                                    <p className="text-sm font-bold text-amber-200">{phaseLabel(as_.elapsed)}</p>
                                  </div>
                                  <div className="space-y-2">
                                    <div className="h-2 bg-zinc-200 dark:bg-zinc-900 rounded-full overflow-hidden border border-zinc-300 dark:border-zinc-800">
                                      <div
                                        className="h-full bg-gradient-to-r from-amber-600 to-amber-400 transition-all duration-1000 shadow-[0_0_15px_rgba(245,158,11,0.3)]"
                                        style={{ width: `${Math.min(98, (as_.elapsed / 180) * 100)}%` }}
                                      />
                                    </div>
                                    <div className="flex justify-between text-[10px] font-mono text-zinc-400 dark:text-zinc-600">
                                      <span>T+{as_.elapsed}S</span>
                                      <span>98% ESTIMATED</span>
                                    </div>
                                  </div>
                                </div>
                              ) : stored && !as_.done ? (
                                <div className="space-y-3">
                                  <p className="text-sm text-emerald-400 font-bold flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4" /> {stored.partial ? "Subject Created" : "Analysis Live"}
                                  </p>
                                  <p className="text-xs text-zinc-400 dark:text-zinc-500 leading-relaxed">
                                    {stored.partial
                                      ? "Subject registered. Upload materials above to trigger AI analysis."
                                      : `Course-specific analysis completed and pushed to student dashboards on ${new Date(stored.updated_at).toLocaleString("en-IN", { hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })}.`}
                                  </p>
                                </div>
                              ) : as_.done && as_.topics ? (
                                <div className="space-y-4">
                                  <div className="flex items-center gap-2 text-emerald-400 text-[11px] font-black uppercase">
                                    <Sparkles className="w-3.5 h-3.5" /> High-Probability Topics
                                  </div>
                                  <div className="grid grid-cols-1 gap-2">
                                    {as_.topics.map((t, i) => (
                                      <div key={i} className="px-3 py-2 rounded-lg bg-zinc-200 dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-800 text-[11px] text-zinc-600 dark:text-zinc-300 font-medium truncate">
                                        {i + 1}. {parseTopicName(t)}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : as_.error ? (
                                <div className="space-y-2">
                                  <div className="flex items-center gap-2 text-red-400 text-[11px] font-black uppercase">
                                    <AlertTriangle className="w-3.5 h-3.5" /> Processing Error
                                  </div>
                                  <p className="text-xs text-red-400/70 leading-relaxed break-words">{as_.error}</p>
                                </div>
                              ) : (
                                <p className="text-xs text-zinc-400 dark:text-zinc-600 italic">Configure material above to begin AI processing.</p>
                              )}
                            </div>

                            <div className="flex gap-3">
                              <button
                                onClick={() => handleUpdateMaterial(subject.code, subject.name)}
                                disabled={as_.saving || !filesReady}
                                className="flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-600 text-white text-xs font-black uppercase tracking-widest hover:bg-emerald-500 transition-all shadow-xl shadow-emerald-600/20 disabled:bg-zinc-800 disabled:text-zinc-600 active:scale-95"
                              >
                                <Cpu className="w-4 h-4" /> {as_.saving ? "Processing..." : "Update Material"}
                              </button>
                              <button
                                onClick={() => handleReset(subject.code, subject.name)}
                                className="w-14 flex items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-600 hover:text-red-400 hover:border-red-500/30 transition-all active:scale-95"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}