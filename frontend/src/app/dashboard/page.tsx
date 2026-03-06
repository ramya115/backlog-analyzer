"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Cpu, Sparkles } from "lucide-react";
import { useSupabaseAuth } from "@/hooks/useSupabaseAuth";

/**
 * /dashboard — The High-Speed Redirect Portal
 * * Optimized for Projector Visibility:
 * - Larger Icons
 * - Enhanced Typography
 * - SSR Safe Hydration Guard
 */

export default function DashboardRedirect() {
  const router = useRouter();
  const { user, role, loading } = useSupabaseAuth();
  const [mounted, setMounted] = useState(false);

  // Hydration Guard: Ensures client-side state is ready before rendering
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted || loading) return;

    if (!user) {
      router.replace("/");
      return;
    }

    // Role-Based Intelligent Routing
    if (role === "professor") {
      router.replace("/professor");
    } else {
      router.replace("/");
    }
  }, [loading, user, role, router, mounted]);

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6">
      <div className="relative group">
        {/* Decorative Radial Glow */}
        <div className="absolute -inset-8 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all duration-1000 animate-pulse" />
        
        <div className="relative flex flex-col items-center gap-8">
          {/* Enhanced Branding Icon */}
          <div className="relative flex items-center justify-center w-20 h-20 rounded-2xl bg-zinc-900 border-2 border-emerald-500/20 shadow-2xl shadow-emerald-500/10">
            <Cpu className="w-10 h-10 text-emerald-400 animate-pulse" />
            <div className="absolute -top-2 -right-2">
              <Sparkles className="w-5 h-5 text-emerald-500/50 animate-bounce" />
            </div>
          </div>

          {/* Typography for Large Screens */}
          <div className="flex flex-col items-center gap-3 text-center">
            <h2 className="text-xl font-bold text-white tracking-tight uppercase">
              {loading ? "Security Check" : "Access Granted"}
            </h2>
            <div className="flex items-center gap-3">
              <div className="flex gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 animate-bounce [animation-delay:-0.3s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 animate-bounce [animation-delay:-0.15s]" />
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/40 animate-bounce" />
              </div>
              <span className="text-zinc-500 text-sm font-mono font-medium tracking-widest uppercase">
                {loading ? "Verifying Sastra Session" : "Routing to Portal"}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="absolute bottom-12 opacity-20 flex items-center gap-2">
        <span className="text-[10px] font-black tracking-[0.3em] text-zinc-400">INTELLIGENT BACKLOG ANALYZER • V1.0</span>
      </div>
    </div>
  );
}