# VIVA Backend — Intelligent Arrear Analyzer

This is the Python-based API layer for the **SASTRA Intelligent Arrear Analyzer (VIVA)**.

## 🛠️ Tech Stack & Services

- **FastAPI**: High-performance asynchronous API framework.
- **Google Gemini 1.5 Flash**: Orchestrates AI analysis and student tutoring.
- **Supabase PostgreSQL**: Managed database for faculty, student profiles, and arreal analysis results.
- **Supabase Cloud Storage**: S3-compatible storage for academic materials (PDFs/Images).
- **OCR Engine**: Multi-modal processing of syllabus and notes via Gemini's vision capabilities.

## 🚀 Quick Start

1. Create and activate a Virtual Environment:
   ```bash
   python -m venv .venv
   # Windows: .venv\Scripts\Activate.ps1
   # Mac/Linux: source .venv/bin/activate
   ```
2. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
3. Set up environment variables in `.env`:
   ```env
   SUPABASE_URL=your_supabase_url
   SUPABASE_KEY=your_supabase_anon_key
   GEMINI_API_KEY=your_gemini_api_key
   UPLOAD_DIR=./uploads
   ```
4. Run the API:
   ```bash
   python -m app.main
   ```
5. View API docs: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

## 🔗 Project Documentation

For the full system architecture and frontend details, please refer to the **[Root README](../README.md)**.
