from __future__ import annotations
import logging
import json
import os
from xml.parsers.expat import model
from xmlrpc import client
from dotenv import load_dotenv
from dotenv import load_dotenv
from fastapi import APIRouter, HTTPException, Query
from google import genai
from google import genai
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.analyzer import BacklogsAnalyzer
from app.services.supabase_service import SupabaseService

logger = logging.getLogger(__name__)

# Main Analysis Router — Handling Student Reports and AI Interactions
router = APIRouter(prefix="", tags=["Analysis"])

# Instance of our Gemini-powered engine
analyzer = BacklogsAnalyzer()

class StudentChatRequest(BaseModel):
    subject_code: str = Field(..., min_length=2, max_length=20)
    question:     str = Field(..., min_length=1, max_length=2000)
    topic_name:   str | None = Field(default=None, max_length=200)

class StudentLoginRequest(BaseModel):
    email:    str = Field(..., min_length=5, max_length=200)
    password: str = Field(..., min_length=1, max_length=100)

@router.post("/student/login", summary="Verify Student Credentials")
async def student_login(body: StudentLoginRequest) -> JSONResponse:
    """
    SERVER-SIDE AUTH: Queries the 'students' table using the service role key,
    which bypasses RLS completely. Validates email + password then returns
    the student's profile (regno, full_name, arrear_codes).
    """
    print(f"[STUDENT] Login attempt for: {body.email!r}", flush=True)
    svc = SupabaseService()
    profile = await svc.verify_student_login(body.email, body.password)

    if not profile:
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    return JSONResponse(content={
        "email":        profile["email"],
        "full_name":    profile.get("full_name"),
        "regno":        profile.get("regno"),
        "department":   profile.get("department"),
        "arrear_codes": profile.get("arrear_codes") or [],
    })

@router.get("/student/report", summary="Fetch professor-stored report for a subject")
async def get_student_report(
    subject_code: str = Query(..., description="Course code, e.g. CS501")
) -> JSONResponse:
    """
    DYNAMIC RETRIEVAL: Resolves the professor-curated report for a specific subject.
    This is a pure DB-read operation (Sub-second latency) ensuring the student
    always sees the latest validated material.
    """
    print(f"[STUDENT] Fetching report for subject: {subject_code!r}", flush=True)
    svc = SupabaseService()
    
    try:
        # Fetches the single source of truth for this subject code
        row = await svc.get_report(subject_code)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Database Handshake Failed: {exc}")

    if not row:
        raise HTTPException(
            status_code=404,
            detail=f"Subject '{subject_code}' has not been analyzed by faculty yet."
        )

    return JSONResponse(content={
        "subject_code": row["subject_code"],
        "subject_name": row["subject_name"],
        "report": row["report_markdown"],
        "qp_pattern": row.get("qp_pattern", "Pattern Pending"),
        "created_at": row.get("created_at"),
        "updated_at": row.get("updated_at"),
    })

@router.get("/student/file-url", summary="Resolve a professor source file to a signed URL")
async def get_student_file_url(
    subject_code: str = Query(..., description="Course code, e.g. CS501"),
    source_name:  str = Query(..., description="Filename cited by AI, e.g. notes.pdf"),
) -> JSONResponse:
    """
    Uses the service-role key to find the professor's uploaded file and returns
    a short-lived signed URL.  This works regardless of whether the Supabase
    storage bucket is public or private, avoiding the anon-key permission
    limitations that occur in the browser.
    """
    print(f"[STUDENT] File URL request: subject={subject_code!r} file={source_name!r}", flush=True)
    svc = SupabaseService()
    try:
        signed_url = await svc.find_and_sign_file(subject_code, source_name)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Storage lookup failed: {exc}")

    if not signed_url:
        raise HTTPException(
            status_code=404,
            detail=f"File '{source_name}' not found in professor's material for {subject_code}.",
        )

    return JSONResponse(content={"url": signed_url})

@router.post("/student/chat", summary="Ask AI a question grounded in professor material")
async def student_chat(body: StudentChatRequest) -> JSONResponse:
    """
    RAG ARCHITECTURE: This endpoint implements Retrieval-Augmented Generation.
    It retrieves the professor's notes from the DB and uses them as the 
    EXCLUSIVELY grounded context for Gemini AI.
    """
    print(f"[CHAT] subject={body.subject_code!r} question={body.question[:50]}...", flush=True)
    svc = SupabaseService()
    
    try:
        row = await svc.get_report(body.subject_code)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"DB error: {exc}")

    if not row:
        raise HTTPException(status_code=404, detail="Analysis context not found.")

    subject_name   = row.get("subject_name", body.subject_code)
    report_context = row.get("report_markdown", "")

    chat_prompt = (
        f"Role: Helpful study assistant for SASTRA University students.\n"
        f"Scope: {subject_name} ({body.subject_code}) and anywhere from the internet .\n\n"
        f"PROFESSOR'S MATERIAL:\n{report_context}\n\n"
        f"Topic Hint: {body.topic_name if body.topic_name else 'General Overview'}\n"
        f"If the material doesn't contain the answer,generate your own answer but relevant to the question.\n\n"
        f"Student's Question: {body.question}"
    )

    try:
        answer = await analyzer.chat(chat_prompt)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"AI Engine Error: {exc}")

    return JSONResponse(content={"answer": answer})

@router.get("/student/profile/{email:path}", summary="Fetch student profile by email")
async def get_student_profile(email: str) -> JSONResponse:
    """
    IDENTITY RESOLUTION: Queries the 'students' table to find the register 
    number and personalized arrear list for the logged-in session.
    """
    print(f"[PROFILE] Fetching data for student: {email!r}", flush=True)
    svc = SupabaseService()
    
    try:
        profile = await svc.get_student_profile(email)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Profile lookup failed: {exc}")

    if not profile:
        raise HTTPException(status_code=404, detail="Student record not found.")

    return JSONResponse(content={
        "regno":         profile["regno"],
        "full_name":     profile.get("full_name"),
        "department":    profile.get("department"),
        "arrear_codes": profile.get("arrear_codes") or [], # Crucial for dashboard filtering
    })

# --- MOCK DATA SEEDING (Idempotent for VIVA Demonstration) ---
@router.get("/models")
def list_models():
        load_dotenv() 
        api_key = os.getenv("GEMINI_API_KEY")
        client = genai.Client(api_key=api_key)  
        for model in client.models.list():
            print(model.name)
            models = client.models.list()
            print(f"Available Models: {[model.name for model in models]}")  
        return {"models": [model.name for model in models]}

@router.post("/admin/seed-students", summary="Populate Demo Students")
async def seed_students() -> JSONResponse:
    """
    Use this endpoint to instantly fill the database with demo records 
    on the professor's laptop before the presentation starts.
    """
    svc = SupabaseService()
    try:
        result = await svc.seed_students()
        return JSONResponse(content=result)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc))