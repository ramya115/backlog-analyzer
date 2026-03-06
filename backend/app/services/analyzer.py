import json
import logging
import httpx
from app.core.config import settings

logger = logging.getLogger(__name__)

# --- SYSTEM PROMPT ENGINEERING ---
# This strictly controls Gemini's output format to ensure compatibility with our frontend parsers.
_ANALYSIS_PROMPT = (
    "You are a specialized Academic Analyst for SASTRA Deemed University. "
    "Your goal is to analyze provided syllabus, Previous Year Questions (PYQs), and lecture notes. "
    "Each document is delimited by '--- SOURCE: filename ---' and '--- END SOURCE ---' markers. "
    "\n\nSTRICT OUTPUT FORMAT:\n"
    "1. Then, provide exactly a numbered list (1 to 5) of the Top 5 highest-weightage topics.\n"
    "2. Format for each topic: 'X. **[Topic Name]** (Source: [Exact Filename.extension]): [1-sentence exam-focused brief].'\n\n"
    "CONSTRAINTS:\n"
    "- Use ONLY the provided material.\n"
    "- Cite the exact filename as it appears between '--- SOURCE: ' and ' ---' in the markers.\n"
    "- Do not include any headers, footers, or conversational filler."
)

class BacklogsAnalyzer:
    """
    Orchestrates interactions with the Google Gemini 2.5 Flash API.
    Handles Subject Analysis for faculty and grounding-based Chat for students.
    """

    async def analyze_subject(self, combined_text: str) -> str:
        """
        Processes multi-file context to generate the Top 5 Study Guide.
        """
        if not combined_text.strip():
            return "## Error\nNo academic data provided for analysis."

        # Constructing the instruction-heavy prompt
        prompt = f"{_ANALYSIS_PROMPT}\n\nACADEMIC RESOURCES TO ANALYZE:\n{combined_text}"
        
        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        # Using the ultra-fast flash model for sub-minute processing
        url = f"https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key={settings.GEMINI_API_KEY}"

        print(f"[AI ENGINE] Sending {len(combined_text):,} characters to Gemini Flash...", flush=True)

        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                response = await client.post(url, json=payload)

            if response.status_code != 200:
                logger.error("Gemini API Error %d: %s", response.status_code, response.text)
                return f"## Analysis Engine Error\nHTTP {response.status_code}: {response.text}"

            data = response.json()
            result = data["candidates"][0]["content"]["parts"][0]["text"]
            print(f"[AI ENGINE] Analysis complete ({len(result)} chars generated).", flush=True)
            return result

        except httpx.TimeoutException:
            return "## Error\nAnalysis timed out. Please try with fewer files."
        except Exception as e:
            return f"## System Failure\n{str(e)}"

    async def chat(self, prompt: str) -> str:
        """
        Grounded RAG Chat: Answers student questions based strictly on professor context.
        """
        if not prompt.strip():
            return "Please enter a specific question about your notes."

        payload = {"contents": [{"parts": [{"text": prompt}]}]}
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={settings.GEMINI_API_KEY}"

        print(f"[AI CHAT] Processing student query...", flush=True)
        
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.post(url, json=payload)

            if response.status_code != 200:
                return f"The AI Tutor is currently unreachable (HTTP {response.status_code})."

            data = response.json()
            answer = data["candidates"][0]["content"]["parts"][0]["text"]
            return answer

        except Exception as e:
            return f"Chat Interface Error: {str(e)}"