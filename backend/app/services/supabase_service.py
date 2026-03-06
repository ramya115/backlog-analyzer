"""
SupabaseService (Native REST Implementation)
===========================================
Handles Cloud Storage (Syllabus/Notes) and PostgreSQL (Student/Professor/Reports).
Uses direct HTTP calls for maximum performance and stability during the demo.
"""

from __future__ import annotations
import asyncio
import logging
import json
import time
import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
from app.core.config import settings

logger = logging.getLogger(__name__)

# The central bucket for all academic materials
_BUCKET = "student-resources"

class SupabaseService:
    def __init__(self) -> None:
        # Standard university-level configuration check
        if not settings.SUPABASE_URL or not settings.SUPABASE_SERVICE_ROLE_KEY:
            raise RuntimeError("Cloud configuration (URL/KEY) missing from .env")
        
        self.url = settings.SUPABASE_URL.strip().strip("'").strip('"')
        self.key = settings.SUPABASE_SERVICE_ROLE_KEY.strip().strip("'").strip('"')
        self.base_api_url = f"{self.url}/storage/v1"
        
        # Standard headers for secure administrative access
        self.auth_headers = {
            "Authorization": f"Bearer {self.key}",
            "apikey": self.key,
            "Content-Type": "application/json"
        }

    # ── SECTION 1: CLOUD STORAGE (FILES) ───────────────────────────────────

    async def list_files(self, folder: str) -> list[str]:
        """Queries the cloud bucket for a list of material files in a specific folder."""
        list_url = f"{self.base_api_url}/object/list/{_BUCKET}"
        payload = {"prefix": f"{folder}/", "limit": 100, "sortBy": {"column": "name", "order": "asc"}}
        
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: requests.post(list_url, json=payload, headers=self.auth_headers, timeout=30))
        
        if response.status_code == 200:
            return [f"{folder}/{item['name']}" for item in response.json() if item.get("name")]
        return []

    async def download_file(self, path: str) -> bytes:
        """Retrieves raw bytes of a document (PDF/Image) for OCR processing."""
        download_url = f"{self.base_api_url}/object/{_BUCKET}/{path}"
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(None, lambda: requests.get(download_url, headers=self.auth_headers, timeout=(10, 120)))
        
        if response.status_code == 200:
            return response.content
        raise FileNotFoundError(f"Material not found at: {path}")

    async def find_and_sign_file(self, subject_code: str, source_name: str) -> str | None:
        """
        Resolves a professor-uploaded file to a signed URL that works regardless
        of whether the storage bucket is public or private.

        Strategy:
        1. List both notes and syllabus folders (using the service-role key so RLS
           or bucket privacy never blocks the lookup).
        2. Try an exact filename match first, then a case-insensitive partial match.
        3. Generate a short-lived (1-hour) signed URL for the matched file.
        """
        search_folders = [
            f"professor/{subject_code}/notes",
            f"professor/{subject_code}/syllabus",
        ]
        list_url = f"{self.base_api_url}/object/list/{_BUCKET}"
        loop = asyncio.get_event_loop()

        for folder in search_folders:
            payload = {"prefix": f"{folder}/", "limit": 100, "sortBy": {"column": "name", "order": "asc"}}
            resp = await loop.run_in_executor(
                None,
                lambda p=payload: requests.post(list_url, json=p, headers=self.auth_headers, timeout=15),
            )
            if resp.status_code != 200:
                continue

            items = resp.json()
            if not items:
                continue

            names = [item["name"] for item in items if item.get("name")]

            # 1. Exact match
            matched_name = next((n for n in names if n == source_name), None)

            # 2. Case-insensitive exact match
            if not matched_name:
                src_lower = source_name.lower()
                matched_name = next((n for n in names if n.lower() == src_lower), None)

            # 3. Partial match on first 20 chars of stem (strip extension)
            if not matched_name:
                import re as _re
                stem = _re.sub(r"\.[^.]+$", "", source_name).lower()[:20]
                if stem:
                    matched_name = next((n for n in names if stem in n.lower()), None)

            if not matched_name:
                continue

            # Generate a 1-hour signed URL via the service-role key
            object_path = f"{folder}/{matched_name}"
            sign_url = f"{self.base_api_url}/object/sign/{_BUCKET}/{object_path}"
            sign_resp = await loop.run_in_executor(
                None,
                lambda u=sign_url: requests.post(
                    u, json={"expiresIn": 3600}, headers=self.auth_headers, timeout=15
                ),
            )
            if sign_resp.status_code == 200:
                signed_path = sign_resp.json().get("signedURL", "")
                if signed_path:
                    # signedURL is a relative path — prefix with the Supabase base URL
                    return f"{self.url}{signed_path}" if signed_path.startswith("/") else signed_path

        return None

    async def upload_file(self, storage_path: str, file_bytes: bytes, content_type: str) -> None:
        """
        Uploads faculty materials with x-upsert=true to overwrite old versions.
        Uses a retry-enabled session and explicit timeout to survive WinError 10053
        (connection aborted mid-transfer on Windows).
        """
        url = f"{self.base_api_url}/object/{_BUCKET}/{storage_path}"
        headers = {**self.auth_headers, "Content-Type": content_type, "x-upsert": "true"}

        def _do_upload() -> None:
            retry_strategy = Retry(
                total=3,
                backoff_factor=2,          # waits 2s, 4s, 8s between retries
                status_forcelist=[500, 502, 503, 504],
                allowed_methods=["POST"],
                raise_on_status=False,
            )
            adapter = HTTPAdapter(max_retries=retry_strategy)
            session = requests.Session()
            session.mount("https://", adapter)
            session.mount("http://", adapter)

            last_exc: Exception | None = None
            for attempt in range(3):
                try:
                    resp = session.post(url, data=file_bytes, headers=headers, timeout=(10, 120))
                    if resp.status_code not in (200, 201):
                        logger.warning("upload_file HTTP %s on attempt %d: %s", resp.status_code, attempt + 1, resp.text[:200])
                    return
                except (requests.exceptions.ConnectionError, requests.exceptions.Timeout) as exc:
                    last_exc = exc
                    logger.warning("upload_file attempt %d failed (%s), retrying…", attempt + 1, exc)
                    time.sleep(2 ** attempt)   # 1s, 2s, 4s back-off
            raise RuntimeError(f"File upload failed after 3 attempts: {last_exc}") from last_exc

        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, _do_upload)

    # ── SECTION 2: IDENTITY & AUTH (SQL TABLES) ───────────────────────────

    async def verify_professor_login(self, email: str, password: str) -> dict | None:
        """Validates credentials against the administrative 'professors' table."""
        url = f"{self.url}/rest/v1/professors"
        params = {"email": f"eq.{email}", "select": "*", "limit": "1"}
        
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=self.auth_headers, params=params))
        rows = resp.json()
        
        if rows and rows[0].get("password") == password:
            return rows[0]
        return None

    async def verify_student_login(self, email: str, password: str) -> dict | None:
        """Validates student credentials and retrieves their 'arrear_codes' mapping."""
        url = f"{self.url}/rest/v1/students"
        params = {"email": f"eq.{email}", "select": "*", "limit": "1"}
        
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=self.auth_headers, params=params))
        rows = resp.json()
        
        if rows and rows[0].get("password") == password:
            return rows[0]
        return None

    async def get_professor_profile(self, email: str) -> dict | None:
        """Fetches a professor's profile (including their assigned subject_code) by email."""
        url = f"{self.url}/rest/v1/professors"
        params = {"email": f"eq.{email}", "select": "*", "limit": "1"}

        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=self.auth_headers, params=params))
        rows = resp.json()
        return rows[0] if rows else None

    async def get_students_for_subject(self, subject_code: str) -> list[dict]:
        """
        Returns all students whose arrear_codes array contains the given subject_code.
        PostgREST syntax for text[]: arrear_codes=cs.{CS501}
        """
        url = f"{self.url}/rest/v1/students"
        params = {
            "arrear_codes": f"cs.{{{subject_code}}}",   # e.g. cs.{CS501}
            "select": "regno,email,full_name,department,arrear_codes"
        }

        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=self.auth_headers, params=params))
        if resp.status_code == 200:
            return resp.json()
        logger.warning("get_students_for_subject failed: %s %s", resp.status_code, resp.text)
        return []

    async def get_student_profile(self, email: str) -> dict | None:
        """Fetches the personalized backlog list for the student dashboard."""
        url = f"{self.url}/rest/v1/students"
        params = {"email": f"eq.{email}", "select": "regno,full_name,department,arrear_codes", "limit": "1"}

        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=self.auth_headers, params=params))
        return resp.json()[0] if resp.json() else None

    # ── SECTION 3: ANALYSIS DATA (STRUCTURED REPORTS) ──────────────────────

    async def save_subject_analysis(self, subject_code: str, top_topics_list: list[str], subject_name: str, professor_email: str, qp_pattern: str) -> None:
        """
        DYNAMICS: JSON-serializes the AI results into the 'report_markdown' column.
        Ensures a Single Source of Truth for every course code.
        """
        url = f"{self.url}/rest/v1/analysis_reports"
        headers = {**self.auth_headers, "Prefer": "resolution=merge-duplicates"}
        
        payload = {
            "subject_code": subject_code,
            "subject_name": subject_name,
            "professor_email": professor_email,
            "report_markdown": json.dumps({"qp_pattern": qp_pattern, "topics": top_topics_list}),
            "partial": False
        }
        
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: requests.post(url, json=payload, headers=headers))

    async def get_report(self, subject_code: str) -> dict | None:
        """
        Returns the full raw analysis_reports row for a subject code.
        Used by the student report and chat endpoints which need subject_name,
        report_markdown, qp_pattern, created_at, and updated_at.
        """
        url = f"{self.url}/rest/v1/analysis_reports"
        params = {
            "subject_code": f"eq.{subject_code}",
            "select": "subject_code,subject_name,professor_email,report_markdown,partial,created_at,updated_at",
            "limit": "1",
        }
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=self.auth_headers, params=params, timeout=15))
        if resp.status_code == 200 and resp.json():
            return resp.json()[0]
        return None

    async def fetch_subject_analysis(self, subject_code: str) -> dict | None:
        """Retrieves structured study topics for the student analysis page."""
        url = f"{self.url}/rest/v1/analysis_reports"
        params = {"subject_code": f"eq.{subject_code}", "select": "report_markdown", "limit": "1"}
        
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=self.auth_headers, params=params))
        
        if resp.status_code == 200 and resp.json():
            data = json.loads(resp.json()[0]["report_markdown"])
            return {"topics": data.get("topics", []), "qp_pattern": data.get("qp_pattern", "")}
        return None

    async def list_reports(self) -> list[dict]:
        """Used by the Faculty Portal to show existing analysis statuses."""
        url = f"{self.url}/rest/v1/analysis_reports"
        params = {"select": "subject_code,subject_name,professor_email,partial,updated_at"}
        
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=self.auth_headers, params=params))
        return resp.json() if resp.status_code == 200 else []

    async def delete_subject_data(self, subject_code: str) -> dict:
        """CLEAN SLATE: Wipes DB rows for a subject code."""
        db_url = f"{self.url}/rest/v1/analysis_reports"
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: requests.delete(db_url, headers=self.auth_headers, params={"subject_code": f"eq.{subject_code}"}))
        return {"deleted": True, "subject": subject_code}

    # ── SECTION 4: SUBJECT MANAGEMENT ──────────────────────────────────────

    async def get_all_students(self) -> list[dict]:
        """Returns all students in the system for subject assignment."""
        url = f"{self.url}/rest/v1/students"
        params = {"select": "regno,email,full_name,department,arrear_codes", "order": "full_name.asc"}
        loop = asyncio.get_event_loop()
        resp = await loop.run_in_executor(None, lambda: requests.get(url, headers=self.auth_headers, params=params))
        return resp.json() if resp.status_code == 200 else []

    async def create_subject_placeholder(self, subject_code: str, subject_name: str, professor_email: str) -> None:
        """Creates a placeholder analysis_reports row for a new subject (no material yet)."""
        url = f"{self.url}/rest/v1/analysis_reports"
        headers = {**self.auth_headers, "Prefer": "resolution=merge-duplicates"}
        payload = {
            "subject_code": subject_code,
            "subject_name": subject_name,
            "professor_email": professor_email,
            "report_markdown": json.dumps({"qp_pattern": "", "topics": []}),
            "partial": True,
        }
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(None, lambda: requests.post(url, json=payload, headers=headers))

    async def add_subject_to_students(self, regnos: list[str], subject_code: str) -> int:
        """Adds subject_code to the arrear_codes of each specified student. Returns count updated."""
        updated = 0
        loop = asyncio.get_event_loop()
        students_url = f"{self.url}/rest/v1/students"
        for regno in regnos:
            # Fetch current arrear_codes for this student
            get_params = {"regno": f"eq.{regno}", "select": "arrear_codes"}
            resp = await loop.run_in_executor(
                None,
                lambda _p=get_params: requests.get(students_url, headers=self.auth_headers, params=_p),
            )
            if resp.status_code != 200 or not resp.json():
                continue
            current_codes: list[str] = resp.json()[0].get("arrear_codes") or []
            if subject_code in current_codes:
                continue
            new_codes = current_codes + [subject_code]
            patch_params = {"regno": f"eq.{regno}"}
            patch_headers = {**self.auth_headers, "Prefer": "return=minimal"}
            await loop.run_in_executor(
                None,
                lambda _pp=patch_params, _ph=patch_headers, _nc=new_codes: requests.patch(
                    students_url, json={"arrear_codes": _nc}, headers=_ph, params=_pp
                ),
            )
            updated += 1
        return updated