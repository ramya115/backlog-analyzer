"use client";

import { useRouter } from "next/navigation";
import { Cpu, GraduationCap, LogOut, Moon, Sun, User, LayoutDashboard, ShieldCheck } from "lucide-react";
import { useTheme } from "next-themes";
import { supabase } from "@/lib/supabase";
import { clearDemoSession } from "@/hooks/useSupabaseAuth";
import { useState, useEffect } from "react";

/**
 * Sidebar Component — The main navigation and identity hub.
 * This component dynamically adapts its theme (light/dark) and 
 * its accent colors (emerald/violet) based on the user's role.
 */

interface SidebarProps {
  displayName: string | null;
  registerNumber: string | null;
  department?: string | null;
  role?: "student" | "professor" | null;
}

export default function Sidebar({ displayName, registerNumber, department, role }: SidebarProps) {
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // 1. HYDRATION GUARD: Prevents icon flickering during theme initialization
  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogout = async () => {
    clearDemoSession(); // Clears local demo session cookies
    await supabase.auth.signOut();
    router.replace("/");
  };

  // 2. DYNAMIC BRANDING: Switches accents based on the authenticated role
  const isProfessor = role === "professor";
  const accentColor = isProfessor ? "text-violet-500 dark:text-violet-400" : "text-emerald-500 dark:text-emerald-400";
  const accentBg = isProfessor ? "bg-violet-500/10" : "bg-emerald-500/10";
  const accentBorder = isProfessor ? "border-violet-500/20" : "border-emerald-500/20";
  const accentGlow = isProfessor ? "shadow-violet-500/5" : "shadow-emerald-500/5";

  // 3. NAME FORMATTING: Skip honorifics (Dr./Prof./Mr./Ms.) and prefer email prefix
  const HONORIFICS = new Set(["dr.", "prof.", "mr.", "ms.", "mrs."]);
  const nameParts = (displayName ?? "").split(" ").filter(Boolean);
  const meaningfulWord = nameParts.find((w) => !HONORIFICS.has(w.toLowerCase()));
  // Fall back to capitalised email prefix (e.g. "professor@..." → "Professor")
  const emailPrefix = typeof window !== "undefined"
    ? (() => { try { const s = JSON.parse(localStorage.getItem("backlogs_demo_user") ?? "{}"); return (s.email ?? "").split("@")[0]; } catch { return ""; } })()
    : "";
  const shortName = meaningfulWord
    ?? (emailPrefix ? emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1) : null)
    ?? registerNumber
    ?? "User";
  const displayDept = department ?? "CSE";

  if (!mounted) return null;

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-zinc-200 dark:border-zinc-800/50 bg-white dark:bg-zinc-950 px-5 py-6 shadow-2xl transition-colors duration-300">
      {/* ── Brand Identity ──────────────────────────────────────────── */}
      <div className="flex items-center gap-3 mb-7 px-1">
        <div className={`flex items-center justify-center w-8 h-8 rounded-xl ${accentBg} border ${accentBorder} shrink-0 shadow-lg`}>
          <Cpu className={`w-4 h-4 ${accentColor}`} />
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-black uppercase tracking-[0.15em] text-zinc-950 dark:text-white">Analyzer</span>
          <span className="text-[9px] font-bold text-zinc-400 dark:text-zinc-600 tracking-widest uppercase">SASTRA University</span>
        </div>
      </div>

      {/* ── Dynamic Profile Card ────────────────────────────────── */}
      <div className={`relative rounded-xl border ${accentBorder} bg-zinc-100/60 dark:bg-zinc-900/40 p-4 mb-7 shadow-xl ${accentGlow} overflow-hidden group`}>
        {/* Cinematic Backdrop Glow */}
        <div className={`absolute -top-4 -right-4 w-12 h-12 rounded-full blur-2xl opacity-20 transition-all group-hover:opacity-40 ${isProfessor ? 'bg-violet-500' : 'bg-emerald-500'}`} />

        <div className="flex items-center gap-3 mb-4 relative z-10">
          <div className={`flex items-center justify-center w-9 h-9 rounded-xl ${accentBg} border ${accentBorder} shrink-0`}>
            {isProfessor ? <ShieldCheck className={`w-5 h-5 ${accentColor}`} /> : <User className={`w-5 h-5 ${accentColor}`} />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-extrabold text-zinc-950 dark:text-white truncate leading-tight">{shortName}</p>
            <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500 truncate">{role ?? "Auth Verified"}</p>
          </div>
        </div>

        <div className="space-y-2 relative z-10">
          {/* REGISTER NUMBER: Highlighted as the core student ID */}
          {registerNumber && (
            <div className={`flex items-center justify-between rounded-lg border ${accentBorder} ${accentBg} px-2.5 py-2`}>
              <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-500 uppercase tracking-widest">ID</span>
              <span className={`text-xs font-mono font-black ${accentColor}`}>{registerNumber}</span>
            </div>
          )}

          <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800/50 pb-1.5">
            <span className="text-[9px] font-black text-zinc-400 dark:text-zinc-600 uppercase">Division</span>
            <div className="flex items-center gap-1.5">
              <GraduationCap className={`w-3.5 h-3.5 ${accentColor}`} />
              <span className={`text-[10px] font-black uppercase tracking-wider ${accentColor}`}>{displayDept}</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Navigation Hub ───────────────────────────────────────────── */}
      <nav className="flex-1 px-1">
        <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-zinc-400 dark:text-zinc-700 mb-3 px-2">Academic Portal</h4>
        <ul className="space-y-1.5">
          <li>
            <div className={`flex items-center gap-2.5 rounded-lg border ${accentBorder} ${accentBg} px-3 py-2.5 shadow-sm transition-all cursor-default`}>
              <LayoutDashboard className={`w-3.5 h-3.5 ${accentColor}`} />
              <span className="text-xs font-black text-zinc-950 dark:text-white tracking-tight">Backlog Overview</span>
            </div>
          </li>
        </ul>
      </nav>

      {/* ── Theme & Session Control ──────────────────────────────────── */}
      <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800/50 space-y-1.5">
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="group flex items-center gap-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-900/30 px-3 py-2.5 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200 hover:border-zinc-300 dark:hover:border-zinc-700 transition-all w-full active:scale-95"
        >
          {theme === "dark" ? <Sun className="w-3.5 h-3.5 shrink-0" /> : <Moon className="w-3.5 h-3.5 shrink-0" />}
          {theme === "dark" ? "Set Light Mode" : "Set Dark Mode"}
        </button>

        <button
          onClick={handleLogout}
          className="group flex items-center gap-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-100/30 dark:bg-zinc-900/30 px-3 py-2.5 text-xs font-black uppercase tracking-widest text-zinc-500 hover:text-red-500 dark:hover:text-red-400 hover:border-red-400/30 dark:hover:border-red-500/30 hover:bg-red-500/5 transition-all w-full active:scale-95"
        >
          <LogOut className="w-3.5 h-3.5 shrink-0 transition-transform group-hover:-translate-x-1" />
          Terminate Session
        </button>
      </div>
    </aside>
  );
}