"use client";

import { useEffect, useRef, useState } from "react";
import { Send, X, Bot, Sparkles, Loader2, User } from "lucide-react";

/**
 * ChatSidebar Component — An AI-driven tutoring interface.
 * Refactored for Multi-Theme support and grounded faculty-only RAG logic.
 */

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatSidebarProps {
  subjectCode: string;
  topicName: string;
  onClose: () => void;
}

export default function ChatSidebar({ subjectCode, topicName, onClose }: ChatSidebarProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "assistant",
      content: `Greetings! I am your SASTRA AI Tutor. I have indexed your professor's notes for **${topicName}**. \n\nHow can I help you prepare for the exam today?`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // 1. HYDRATION GUARD: Ensures smooth entry animation and theme matching
  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    if (mounted) inputRef.current?.focus();
  }, [mounted]);

  /**
   * API HANDLER: Sends student questions to the FastAPI backend.
   * Ensures the conversation is scoped strictly to the current subject code.
   */
  const sendMessage = async () => {
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: question }]);
    setLoading(true);

    try {
      const res = await fetch("https://backlog-analyzer.onrender.com/student/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_code: subjectCode,
          question,
          topic_name: topicName,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { detail?: string }).detail ?? `HTTP ${res.status}`);
      }

      const data = (await res.json()) as { answer: string };
      setMessages((prev) => [...prev, { role: "assistant", content: data.answer }]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `⚠️ System Error: ${(err as Error).message || "Connection lost."}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!mounted) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-50 flex flex-col w-full max-w-[400px] border-l border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 shadow-[0_0_50px_rgba(0,0,0,0.2)] dark:shadow-[0_0_50px_rgba(0,0,0,0.8)] animate-in slide-in-from-right duration-300">

      {/* ── Premium Header ── */}
      <div className="flex items-center justify-between px-6 py-5 border-b border-zinc-200 dark:border-zinc-800/50 bg-zinc-50 dark:bg-zinc-900/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="relative">
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
              <Bot className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-zinc-950 rounded-full animate-pulse" />
          </div>
          <div className="min-w-0">
            <h3 className="text-sm font-black uppercase tracking-widest text-zinc-900 dark:text-white flex items-center gap-2">
              SASTRA AI <Sparkles className="w-3 h-3 text-emerald-500" />
            </h3>
            <p className="text-[11px] text-zinc-500 font-medium truncate italic" title={topicName}>
              Subject: {subjectCode}
            </p>
          </div>
        </div>
        <button onClick={onClose} className="rounded-xl p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200 dark:hover:bg-zinc-800 transition-all active:scale-90">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* ── Chat Canvas ── */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-6 scrollbar-hide">
        {messages.map((msg, i) => (
          <div key={i} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"} gap-2`}>
            <div className="flex items-center gap-2 px-1">
              {msg.role === "assistant" ? <Bot className="w-3 h-3 text-emerald-500" /> : <User className="w-3 h-3 text-zinc-400" />}
              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-400 dark:text-zinc-600">{msg.role}</span>
            </div>
            <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${msg.role === "user"
                ? "bg-emerald-600 text-white rounded-tr-none font-medium"
                : "bg-zinc-100 dark:bg-zinc-900 text-zinc-800 dark:text-zinc-200 rounded-tl-none border border-zinc-200 dark:border-zinc-800"
              }`}>
              {msg.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex flex-col items-start gap-2">
            <div className="flex items-center gap-2 px-1">
              <Bot className="w-3 h-3 text-emerald-500" />
              <span className="text-[9px] font-black uppercase tracking-widest text-zinc-600">AI Tutor</span>
            </div>
            <div className="bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl rounded-tl-none px-5 py-4 flex items-center gap-2 shadow-sm">
              <Loader2 className="w-4 h-4 text-emerald-500 animate-spin" />
              <span className="text-xs font-bold text-emerald-600/50 dark:text-emerald-500/50 tracking-widest uppercase">Consulting Notes...</span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Adaptive Input Box ── */}
      <div className="p-6 bg-white dark:bg-zinc-950 border-t border-zinc-200 dark:border-zinc-800/50">
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500/20 to-emerald-500/0 rounded-2xl blur opacity-0 group-focus-within:opacity-100 transition-opacity" />
          <div className="relative flex items-end gap-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 px-4 py-3 focus-within:border-emerald-500/50 transition-all">
            <textarea
              ref={inputRef}
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask a specific question..."
              disabled={loading}
              className="flex-1 resize-none bg-transparent text-sm text-zinc-900 dark:text-white placeholder:text-zinc-400 dark:placeholder:text-zinc-600 focus:outline-none max-h-32 disabled:opacity-50 py-1"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="flex items-center justify-center w-9 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 shadow-lg shadow-emerald-600/20 disabled:opacity-20 transition-all active:scale-90"
            >
              <Send className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>
        <div className="mt-4 flex items-center justify-center gap-2 opacity-60">
          <div className="w-1 h-1 rounded-full bg-emerald-500" />
          <p className="text-[10px] font-bold text-zinc-500 dark:text-zinc-700 uppercase tracking-widest">
            Grounded in Verified Sastra Materials
          </p>
          <div className="w-1 h-1 rounded-full bg-emerald-500" />
        </div>
      </div>
    </div>
  );
}