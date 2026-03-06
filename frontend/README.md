# VIVA Frontend — Intelligent Arrear Analyzer

This is the frontend layer of the **SASTRA Intelligent Arrear Analyzer (VIVA)**, built with Next.js 15.

## 🚀 Quick Start

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set up environment variables in `.env.local`:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000).

## 🛠️ Tech Stack & Architecture

- **Next.js 15**: App Router architecture with Turbopack for performance.
- **Tailwind CSS**: Utility-first styling with custom theme-aware colors (`dark:` variants).
- **Lucide Icons**: Consistent iconography throughout the portal.
- **next-themes**: Robust light/dark mode orchestration.
- **Supabase JS**: Direct database interaction for student features and auth.

## 🔗 Project Documentation

For the full system architecture, backend details, and environment setup, please refer to the **[Root README](../README.md)**.
