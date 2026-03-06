"""
list_gemini_models.py
=====================
Run from the backend directory to see every Gemini model your API key
has access to, along with its supported generation methods.

Usage:
    cd backend
    python ../scripts/list_gemini_models.py
"""

import os
import sys
import requests
from pathlib import Path

# Load .env from the backend folder
env_path = Path(__file__).parent.parent / "backend" / ".env"
if env_path.exists():
    for line in env_path.read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, val = line.partition("=")
            os.environ.setdefault(key.strip(), val.strip())

API_KEY = os.environ.get("GEMINI_API_KEY", "")
if not API_KEY:
    print("ERROR: GEMINI_API_KEY not found. Check backend/.env", file=sys.stderr)
    sys.exit(1)

url = f"https://generativelanguage.googleapis.com/v1beta/models?key={API_KEY}&pageSize=100"
resp = requests.get(url, timeout=15)

if resp.status_code != 200:
    print(f"API error {resp.status_code}: {resp.text}")
    sys.exit(1)

models = resp.json().get("models", [])

# Filter to only generative (generateContent-capable) models
gen_models = [m for m in models if "generateContent" in m.get("supportedGenerationMethods", [])]

print(f"\n{'='*65}")
print(f"  GEMINI MODELS AVAILABLE FOR generateContent  ({len(gen_models)} found)")
print(f"{'='*65}")

for m in gen_models:
    name        = m.get("name", "")          # e.g. models/gemini-1.5-flash
    display     = m.get("displayName", "")
    description = m.get("description", "")[:80]
    in_limit    = m.get("inputTokenLimit", "?")
    out_limit   = m.get("outputTokenLimit", "?")
    methods     = ", ".join(m.get("supportedGenerationMethods", []))

    short_name = name.replace("models/", "")   # the part you pass to the API
    print(f"\n  Model ID  : {short_name}")
    print(f"  Display   : {display}")
    print(f"  Input tok : {in_limit:,}" if isinstance(in_limit, int) else f"  Input tok : {in_limit}")
    print(f"  Output tok: {out_limit:,}" if isinstance(out_limit, int) else f"  Output tok: {out_limit}")
    print(f"  Methods   : {methods}")

print(f"\n{'='*65}")
print("  To use a model, set the ID in analyzer.py, e.g.:")
print("  gemini-2.0-flash  or  gemini-1.5-pro  or  gemini-2.5-pro-exp-03-25")
print(f"{'='*65}\n")
