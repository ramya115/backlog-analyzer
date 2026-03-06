"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

/** * ROLE DEFINITIONS
 * - student: Identified by an all-digit email prefix (Register Number).
 * - professor: Identified by any other prefix.
 */
export type UserRole = "student" | "professor";

type AuthUser = Pick<User, "email" | "user_metadata">;

// ── Session Constants ──────────────────────────────────────────────────────
const DEMO_KEY = "backlogs_demo_user";
const DEMO_EVENT = "backlogs-demo-auth-change";

interface DemoSession {
  email: string;
  displayName: string;
  registerNumber: string;
  role?: UserRole;
  subjectCode?: string; // Professor's assigned domain (e.g. "CS501")
  arrearCodes?: string[]; // Student's personalized arrear list
}

/** Utility to retrieve session from storage without triggering SSR errors */
function getDemoSession(): DemoSession | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(DEMO_KEY);
    return raw ? (JSON.parse(raw) as DemoSession) : null;
  } catch { return null; }
}

/** Clears all session traces for a secure logout */
export function clearDemoSession() {
  if (typeof window !== "undefined") {
    localStorage.removeItem(DEMO_KEY);
    window.dispatchEvent(new Event(DEMO_EVENT));
  }
}

// ── Hook Interface ──────────────────────────────────────────────────────────

export interface UseSupabaseAuthReturn {
  user: AuthUser | null;
  /** Primary identifier for students (Register No.) */
  registerNumber: string | null;
  /** Dynamic role resolved from email or session metadata */
  role: UserRole;
  /** The specific Course Code assigned to a Professor */
  subjectCode: string | null;
  /** Personalized list of subject codes for the logged-in student */
  arrearCodes: string[];
  loading: boolean;
}

/**
 * useSupabaseAuth Hook — The central identity provider for the application.
 * Synchronizes Supabase Auth events with local database-driven demo sessions.
 */
export function useSupabaseAuth(): UseSupabaseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [demoSession, setDemoSession] = useState<DemoSession | null>(null);

  useEffect(() => {
    setMounted(true);
    setDemoSession(getDemoSession());

    // 1. DATABASE HANDSHAKE: Verify existing Supabase session
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user ?? null);
      setLoading(false);
    });

    // 2. REAL-TIME LISTENER: Detect sign-in/out events
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    // 3. DEMO OVERRIDE: Listen for local identity changes
    const handleDemoChange = () => setDemoSession(getDemoSession());
    window.addEventListener(DEMO_EVENT, handleDemoChange);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener(DEMO_EVENT, handleDemoChange);
    };
  }, []);

  // HYDRATION GUARD: Prevents flickering UI on the professor's laptop
  if (!mounted) {
    return { user: null, registerNumber: null, role: "student", subjectCode: null, arrearCodes: [], loading: true };
  }

  // --- IDENTITY RESOLUTION PRIORITY ---

  // A. DEMO SESSION (Used for the 'SQL LOOKUP' demo flow)
  if (demoSession) {
    const demoRole: UserRole = demoSession.role ?? "student";
    return {
      user: {
        email: demoSession.email,
        user_metadata: { full_name: demoSession.displayName },
      },
      registerNumber: demoRole === "student" ? demoSession.registerNumber : null,
      subjectCode: demoSession.subjectCode ?? null,
      arrearCodes: demoSession.arrearCodes ?? [],
      role: demoRole,
      loading: false,
    };
  }

  // B. LIVE GOOGLE AUTH SESSION (Resolved via Email Logic)
  const emailPrefix = user?.email ? user.email.split("@")[0] : null;

  // Student identification logic: Prefix is purely numeric (e.g., 128003202)
  const isNumeric = emailPrefix && /^\d+$/.test(emailPrefix);
  const role: UserRole = isNumeric ? "student" : "professor";
  const registerNumber = role === "student" ? emailPrefix : null;

  return { 
    user, 
    registerNumber, 
    subjectCode: null, // Live Google users fall back to DB lookup in the dashboard
    arrearCodes: [],   // Live students fetch this dynamically in page.tsx
    role, 
    loading 
  };
}