"use client";

import { useState, useEffect } from "react";
import { Cpu, Lock, User, Sparkles, Loader2, AlertCircle, Eye, EyeOff, Sun, Moon } from "lucide-react";
import { signInWithGoogle, supabase } from "@/lib/supabase";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

type ActivePanel = null | "faculty" | "student";

export default function LoginPage() {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(null);

  // Faculty form
  const [facultyEmail, setFacultyEmail] = useState("");
  const [facultyPassword, setFacultyPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  // Student form
  const [studentEmail, setStudentEmail] = useState("");
  const [studentPassword, setStudentPassword] = useState("");
  const [showStudentPassword, setShowStudentPassword] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const openPanel = (panel: ActivePanel) => {
    setActivePanel(prev => prev === panel ? null : panel);
    setAuthError(null);
  };

  /** Faculty login — queries professors table with user-entered email + password */
  const handleFacultyAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!facultyEmail.trim() || !facultyPassword.trim()) {
      setAuthError("Please enter your email and password.");
      return;
    }
    setAuthError(null);
    setIsLoggingIn(true);

    try {
      const { data, error } = await supabase
        .from("professors")
        .select("*")
        .eq("email", facultyEmail.trim())
        .eq("password", facultyPassword)
        .single();

      if (error) throw new Error(`DB Error: ${error.message} (code: ${error.code})`);
      if (!data) throw new Error("No matching professor found. Check email/password.");

      localStorage.setItem("backlogs_demo_user", JSON.stringify({
        email: data.email,
        displayName: data.full_name,
        role: "professor" as const,
        subjectCode: data.subject_code,
      }));
      window.dispatchEvent(new Event("backlogs-demo-auth-change"));
      router.push("/professor");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "An unknown error occurred.");
      setIsLoggingIn(false);
    }
  };

  /** Student login — calls backend /student/login (bypasses RLS via service role key) */
  const handleStudentAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = studentEmail.trim().toLowerCase();
    const password = studentPassword;

    if (!email) {
      setAuthError("Please enter your Sastra email address.");
      return;
    }
    if (!email.endsWith("@sastra.ac.in")) {
      setAuthError("Only @sastra.ac.in email addresses are allowed.");
      return;
    }
    if (!password) {
      setAuthError("Please enter your password.");
      return;
    }

    setAuthError(null);
    setIsLoggingIn(true);

    try {
      const res = await fetch("http://127.0.0.1:8000/student/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Invalid email or password." }));
        throw new Error(err.detail ?? "Invalid email or password.");
      }

      const data = await res.json();

      localStorage.setItem("backlogs_demo_user", JSON.stringify({
        email: data.email,
        displayName: data.full_name,
        registerNumber: data.regno,
        role: "student" as const,
        arrearCodes: data.arrear_codes,
      }));
      window.dispatchEvent(new Event("backlogs-demo-auth-change"));
      router.push("/");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "An unknown error occurred.");
      setIsLoggingIn(false);
    }
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-zinc-950 flex items-center justify-center px-4 selection:bg-emerald-500/30 font-sans">
      {/* ── Theme Toggle (Bottom Left to match Sidebar) ── */}
      <button
        onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
        className="fixed bottom-4 left-4 z-50 flex items-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-2.5 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700 shadow-xl transition-all active:scale-95"
      >
        {theme === "dark" ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
        {theme === "dark" ? "Set Light Mode" : "Set Dark Mode"}
      </button>

      <div className="w-full max-w-[380px] relative">
        <div className="absolute -inset-1 bg-gradient-to-r from-emerald-500/20 to-violet-500/20 rounded-2xl blur-2xl opacity-50" />



        <div className="relative rounded-2xl border border-zinc-200 dark:border-zinc-800/50 bg-white/95 dark:bg-zinc-900/80 backdrop-blur-xl px-8 py-8 shadow-2xl overflow-hidden">

          {/* Brand */}
          <div className="flex flex-col items-center gap-3 mb-7">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-xl bg-zinc-100 dark:bg-zinc-950 border border-emerald-500/30">
              <Cpu className="w-6 h-6 text-emerald-400" />
              <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-emerald-500 animate-pulse" />
            </div>
            <div className="text-center">
              <h1 className="text-2xl font-black text-zinc-950 dark:text-white tracking-tight mb-0.5 uppercase">
                Backlog <span className="text-emerald-400">Analyzer</span>
              </h1>
              <p className="text-[10px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-[0.3em]">
                SASTRA University Portal
              </p>
            </div>
          </div>

          {/* Google Auth */}
          <div className="mb-6">
            <button
              onClick={() => signInWithGoogle()}
              disabled={isLoggingIn}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-zinc-700 bg-white hover:bg-zinc-100 transition-all py-3 px-5 text-sm font-black text-zinc-950 shadow-xl active:scale-95"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
              Sign in with Sastra ID
            </button>
          </div>

          {/* Login Panels */}
          <div className="pt-5 border-t border-zinc-200 dark:border-zinc-800/50 space-y-2">

            {/* Error Banner */}
            {authError && (
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 mb-3 animate-in fade-in duration-300">
                <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0" />
                <p className="text-[10px] font-bold text-red-400 leading-relaxed">{authError}</p>
              </div>
            )}

            {/* ── Faculty Login ── */}
            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden">
              <button
                type="button"
                onClick={() => openPanel("faculty")}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-violet-500/10 transition-all text-violet-400 group"
              >
                <div className="flex items-center gap-2.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-black uppercase tracking-widest">Faculty Login</span>
                </div>
                <span className="text-[10px] font-bold opacity-40 group-hover:opacity-100 tracking-tighter">
                  {activePanel === "faculty" ? "HIDE ↑" : "ENTER CREDENTIALS →"}
                </span>
              </button>

              {activePanel === "faculty" && (
                <form onSubmit={handleFacultyAuth} className="px-4 pb-4 space-y-3 border-t border-violet-500/20">
                  <div className="space-y-1.5 pt-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Email</label>
                    <input
                      type="email"
                      value={facultyEmail}
                      onChange={(e) => setFacultyEmail(e.target.value)}
                      placeholder="professor@sastra.ac.in"
                      className="w-full rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-violet-500/60 transition-colors"
                      autoFocus
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={facultyPassword}
                        onChange={(e) => setFacultyPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 px-3 py-2 pr-9 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-violet-500/60 transition-colors"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400"
                      >
                        {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-2 rounded-lg bg-violet-600 hover:bg-violet-500 text-white text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isLoggingIn ? "Verifying..." : "Sign In as Faculty"}
                  </button>
                </form>
              )}
            </div>

            {/* ── Student Login ── */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 overflow-hidden">
              <button
                type="button"
                onClick={() => openPanel("student")}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-emerald-500/10 transition-all text-emerald-400 group"
              >
                <div className="flex items-center gap-2.5">
                  <User className="w-3.5 h-3.5" />
                  <span className="text-[11px] font-black uppercase tracking-widest">Student Login</span>
                </div>
                <span className="text-[10px] font-bold opacity-40 group-hover:opacity-100 tracking-tighter">
                  {activePanel === "student" ? "HIDE ↑" : "ENTER EMAIL →"}
                </span>
              </button>

              {activePanel === "student" && (
                <form onSubmit={handleStudentAuth} className="px-4 pb-4 space-y-3 border-t border-emerald-500/20">
                  <div className="space-y-1.5 pt-3">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Sastra Email</label>
                    <input
                      type="email"
                      value={studentEmail}
                      onChange={(e) => setStudentEmail(e.target.value)}
                      placeholder="128003202@sastra.ac.in"
                      className="w-full rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 transition-colors"
                      autoFocus
                    />
                    <p className="text-[9px] text-zinc-500 dark:text-zinc-600 font-medium">Register number is extracted automatically from your email.</p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-zinc-500 dark:text-zinc-400">Password</label>
                    <div className="relative">
                      <input
                        type={showStudentPassword ? "text" : "password"}
                        value={studentPassword}
                        onChange={(e) => setStudentPassword(e.target.value)}
                        placeholder="••••••••"
                        className="w-full rounded-lg bg-zinc-50 dark:bg-zinc-950 border border-zinc-300 dark:border-zinc-700 px-3 py-2 pr-9 text-xs text-zinc-800 dark:text-zinc-200 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-emerald-500/60 transition-colors"
                      />
                      <button
                        type="button"
                        tabIndex={-1}
                        onClick={() => setShowStudentPassword(!showStudentPassword)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 dark:text-zinc-600 hover:text-zinc-600 dark:hover:text-zinc-400"
                      >
                        {showStudentPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <button
                    type="submit"
                    disabled={isLoggingIn}
                    className="w-full py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                  >
                    {isLoggingIn ? "Looking up..." : "Sign In as Student"}
                  </button>
                </form>
              )}
            </div>
          </div>
        </div>

        {/* Global loading overlay */}
        {isLoggingIn && (
          <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/80 dark:bg-zinc-950/80 backdrop-blur-sm rounded-2xl">
            <Loader2 className="w-8 h-8 text-emerald-500 animate-spin mb-3" />
            <span className="text-[10px] font-black text-zinc-500 dark:text-zinc-400 uppercase tracking-[0.2em] animate-pulse">Connecting to Database…</span>
          </div>
        )}
      </div>
    </div>
  );
}