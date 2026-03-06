from __future__ import annotations
import asyncio
import logging
import re
import traceback
from typing import List
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.services.analyzer import BacklogsAnalyzer
from app.services.extractor import UniversalExtractor
from app.services.supabase_service import SupabaseService

logger = logging.getLogger(__name__)

# --- PROFESSOR PORTAL ROUTER ---
# Handles Material Ingestion, AI Logic, and Subject Management
router = APIRouter(prefix="/professor", tags=["Professor"])

extractor = UniversalExtractor() # Handles OCR and PDF parsing
analyzer  = BacklogsAnalyzer()   # Handles Gemini AI orchestration

# Semaphore ensures we don't overwhelm the CPU/AI during concurrent file extractions
_EXTRACTION_SEMAPHORE = asyncio.Semaphore(1)

# --- LOGIN & IDENTITY ---

class ProfessorLoginRequest(BaseModel):
    email:    str = Field(..., min_length=5, max_length=200)
    password: str = Field(..., min_length=1, max_length=100)

@router.post("/login", summary="Verify Faculty Credentials")
async def professor_login(body: ProfessorLoginRequest) -> JSONResponse:
    """
    DYNAMIC AUTH: Queries the 'professors' table directly.
    Retrieves the professor's full name and their assigned 'subject_code'.
    """
    svc = SupabaseService()
    profile = await svc.verify_professor_login(body.email, body.password)

    if not profile:
        raise HTTPException(status_code=401, detail="Invalid Faculty Credentials.")

    return JSONResponse(content={
        "email":         profile["email"],
        "full_name":     profile.get("full_name"),
        "subject_code": profile.get("subject_code"), # Sovereign course identifier
        "department":    profile.get("department"),
    })

# --- ANALYSIS ENGINE ---

def _parse_topics_and_qp(markdown: str) -> tuple[list[str], str]:
    """
    POST-PROCESSING: Extracts structured data from Gemini's markdown response.
    Specifically pulls the 5 numbered topics and the 'QP_PATTERN' tag.
    """
    topics: list[str] = []
    qp_pattern: str = ""
    for line in markdown.splitlines():
        stripped = line.strip()
        if stripped.upper().startswith("QP_PATTERN:"):
            qp_pattern = stripped[len("QP_PATTERN:"):].strip()
        elif re.match(r"^[1-5]\.", stripped):
            topics.append(stripped)
    
    # Ensuring we always return exactly 5 slots for UI stability
    while len(topics) < 5:
        topics.append(f"{len(topics) + 1}. (Topic not identified)")
    return topics[:5], qp_pattern

@router.post("/analyze-and-save", summary="Upload, OCR, and AI Analysis")
async def analyze_and_save(
    syllabus_files: List[UploadFile] = File(default=[]),
    notes_files:    List[UploadFile] = File(default=[]),
    subject_code: str    = Form(...),
    subject_name: str    = Form(default=""),
    professor_email: str = Form(...),
) -> JSONResponse:
    """
    PIPELINE ARCHITECTURE:
    1. VALIDATE: Ensures this professor owns the subject_code.
    2. STORAGE: Persists files to Supabase Cloud Storage.
    3. OCR: Extracts text from PDFs and Images.
    4. GEN-AI: Sends text to Gemini for Top-5 Topic Extraction.
    5. PERSIST: Saves structured JSON to PostgreSQL.
    """
    print(f"[FACULTY] Starting Analysis Pipeline for: {subject_code}", flush=True)

    # 1. OWNERSHIP ENFORCEMENT: professor's assigned subject OR created via create-subject
    svc = SupabaseService()
    prof_profile = await svc.get_professor_profile(professor_email)
    if not prof_profile:
        raise HTTPException(status_code=403, detail="Professor not found.")

    owns_via_profile = prof_profile.get("subject_code") == subject_code
    owns_via_report = False
    if not owns_via_profile:
        existing_report = await svc.get_report(subject_code)
        if existing_report and existing_report.get("professor_email") == professor_email:
            owns_via_report = True

    if not owns_via_profile and not owns_via_report:
        raise HTTPException(status_code=403, detail="Unauthorized: You do not own this course code.")

    # 2. FILE PREPARATION
    all_chunks: list[str] = []
    file_tasks = []
    for f in syllabus_files: file_tasks.append((f, "syllabus", "SYLLABUS"))
    for f in notes_files:    file_tasks.append((f, "notes", "NOTES"))

    if not file_tasks:
        raise HTTPException(status_code=400, detail="No source material provided.")

    # 3. OCR & STORAGE LOOP
    for idx, (upload, folder, cat) in enumerate(file_tasks, start=1):
        file_bytes = await upload.read()
        storage_path = f"professor/{subject_code}/{folder}/{upload.filename}"
        
        # Upload to Cloud Storage
        await svc.upload_file(storage_path, file_bytes, upload.content_type)

        # Extract Text via Universal Extractor
        async with _EXTRACTION_SEMAPHORE:
            chunk = await extractor.extract_content_from_bytes(file_bytes, upload.filename, cat)
            all_chunks.append(chunk)
        
        # Rate limit protection for Gemini Free Tier
        if idx < len(file_tasks): await asyncio.sleep(5)

    # 4. GEMINI REASONING
    combined_context = "\n\n".join(all_chunks)
    report_markdown = await analyzer.analyze_subject(combined_context)
    
    # 5. DATA STRUCTURING
    top_topics, qp_pattern = _parse_topics_and_qp(report_markdown)

    # 6. DATABASE COMMIT
    await svc.save_subject_analysis(
        subject_code=subject_code,
        top_topics_list=top_topics,
        qp_pattern=qp_pattern,
        subject_name=subject_name,
        professor_email=professor_email
    )

    return JSONResponse(content={
        "subject_code": subject_code,
        "top_topics": top_topics,
        "qp_pattern": qp_pattern,
        "status": "Validated & Synchronized"
    })

@router.delete("/reset/{subject_code}", summary="Wipe Subject Data")
async def reset_subject(subject_code: str, professor_email: str = Query(...)) -> JSONResponse:
    """
    CLEAN SLATE: Deletes all cloud files and DB analysis for a subject.
    Requires Ownership Check — professor must own this subject via their profile
    OR have created it via the analysis_reports table.
    """
    svc = SupabaseService()

    # Security check: professor owns via profile **or** created in analysis_reports
    prof = await svc.get_professor_profile(professor_email)
    if not prof:
        raise HTTPException(status_code=403, detail="Professor not found.")

    owns_via_profile = prof.get("subject_code") == subject_code
    owns_via_report = False
    if not owns_via_profile:
        report = await svc.get_report(subject_code)
        if report and report.get("professor_email") == professor_email:
            owns_via_report = True

    if not owns_via_profile and not owns_via_report:
        raise HTTPException(status_code=403, detail="Unauthorized reset request.")

    await svc.delete_subject_data(subject_code)
    return JSONResponse(content={"message": f"Wiped {subject_code}", "deleted": True})

@router.get("/reports", summary="Dashboard Overview")
async def list_reports(professor_email: str = Query(...)) -> JSONResponse:
    """
    Lightweight fetch of reports filtered by the logged-in professor.
    Used to show 'Validated' badges on the Professor UI.
    """
    svc = SupabaseService()
    rows = await svc.list_reports()
    # Filter to only show the subject owned by this professor
    filtered = [r for r in rows if r.get("professor_email") == professor_email]
    return JSONResponse(content={"reports": filtered})


@router.get("/students", summary="List Students for Professor's Subject")
async def list_students_for_professor(professor_email: str = Query(...)) -> JSONResponse:
    """
    Fetches all students who have the professor's assigned subject in their backlog.
    Logic: look up professor → get their subject_code → find students with that code in arrear_codes.
    """
    svc = SupabaseService()

    # Step 1: Resolve this professor's assigned subject code
    prof = await svc.get_professor_profile(professor_email)
    if not prof:
        raise HTTPException(status_code=404, detail="Professor not found.")

    subject_code = prof.get("subject_code")
    if not subject_code:
        raise HTTPException(status_code=400, detail="Professor has no subject assigned.")

    # Step 2: Fetch students whose arrear_codes contain that subject
    students = await svc.get_students_for_subject(subject_code)
    return JSONResponse(content={"students": students, "subject_code": subject_code})


@router.get("/all-students", summary="List All Students (for subject assignment)")
async def list_all_students() -> JSONResponse:
    """Returns every student in the system so the professor can assign them to a new subject."""
    svc = SupabaseService()
    students = await svc.get_all_students()
    return JSONResponse(content={"students": students})


class CreateSubjectRequest(BaseModel):
    subject_code: str = Field(..., min_length=1, max_length=30)
    subject_name: str = Field(..., min_length=1, max_length=200)
    professor_email: str = Field(..., min_length=5, max_length=200)
    student_regnos: List[str] = Field(default_factory=list)


@router.post("/create-subject", summary="Create a Subject and Assign to Students")
async def create_subject(body: CreateSubjectRequest) -> JSONResponse:
    """
    Creates a placeholder subject row in analysis_reports and adds the subject_code
    to the arrear_codes of every selected student.
    """
    svc = SupabaseService()

    # Verify professor exists
    prof = await svc.get_professor_profile(body.professor_email)
    if not prof:
        raise HTTPException(status_code=404, detail="Professor not found.")

    # Create placeholder analysis_reports row (partial=True, no material yet)
    await svc.create_subject_placeholder(body.subject_code, body.subject_name, body.professor_email)

    # Assign subject to selected students
    updated = await svc.add_subject_to_students(body.student_regnos, body.subject_code)

    return JSONResponse(content={
        "subject_code": body.subject_code,
        "subject_name": body.subject_name,
        "students_updated": updated,
        "status": "Subject created and assigned",
    })
