import os
import logging
import pathlib
from contextlib import asynccontextmanager
from dotenv import load_dotenv
from google import genai

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# --- VIVA LOGGING CONFIGURATION ---
# Ensures all system events are time-stamped and clearly visible in your terminal.
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
    datefmt="%H:%M:%S",
)
load_dotenv()
api_key = os.getenv("GEMINI_API_KEY")
client = genai.Client(api_key=api_key)
from app.core.config import settings
from app.routers.analyze import router as analyze_router
from app.routers.professor import router as professor_router

# ── Application Lifecycle (Sastra AI Handshake) ──────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Initialises environment directories and prints a high-visibility 
    dashboard to your terminal on startup.
    """
    upload_dir = pathlib.Path(settings.UPLOAD_DIR)
    upload_dir.mkdir(parents=True, exist_ok=True)
    
    print("\n" + "█"*60, flush=True)
    print("  SASTRA INTELLIGENT ARREAR ANALYZER — BACKEND ONLINE", flush=True)
    print("  API HOST: http://127.0.0.1:8000", flush=True)
    print("   STATUS: Secured via Database-Driven Ownership Model", flush=True)
    print("█"*60 + "\n", flush=True)
    yield

# ── FastAPI Instance ────────────────────────────────────────────────────────
app = FastAPI(
    title="Intelligent Arrear Analyzer",
    description="Unified API for Faculty Ingestion and Student AI Tutoring.",
    version="1.0.0",
    lifespan=lifespan,
)

# ── CORS SECURITY (Enables Next.js Communication) ──────────────────────────
# Allows your frontend (Port 3000) to securely talk to this backend (Port 8000).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── ROUTER REGISTRATION ───────────────────────────────────────────────────
# analyze_router: Handles student profile fetching, reports, and AI chat.
# professor_router: Handles faculty login, file uploads, and analysis.
app.include_router(analyze_router)
app.include_router(professor_router)

# ── Health Check (VIVA Landing Page) ───────────────────────────────────────
@app.get("/", tags=["System"])
async def root():
    """Simple endpoint to prove the backend is alive before starting the demo."""
    print("[SYSTEM] Status Probe: Success", flush=True)
    return {
        "project": "Intelligent Arrear Analyzer",
        "institution": "SASTRA Deemed University",
        "engine": "Gemini 1.5 Flash + FastAPI + Supabase",
        "status": "Ready for Demonstration"
    }


# ── Developer Entrypoint ──────────────────────────────────────────────────
if __name__ == "__main__":
    import uvicorn
    # Start the server with hot-reload enabled for a smooth presentation
    for model in client.models.list():
        print(f"Model: {model.name}")
        print(f"Capabilities: {model.supported_generation_methods}\n")
    uvicorn.run("app.main:app", host="127.0.0.1", port=8000, reload=True)