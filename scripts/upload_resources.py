"""
upload_resources_native.py
==========================
Uses Native REST API to bypass the 'proxy' argument bug in the Supabase library.
"""

import os
import pathlib
import sys
import mimetypes
import requests
from dotenv import load_dotenv

# ── Configuration ─────────────────────────────────────────────────────────────
LOCAL_BASE_PATH   = pathlib.Path("D:/notes/project")
REGISTER_NUMBER   = "123002001" 
BUCKET_NAME       = "student-resources"
SUB_FOLDERS       = ["syllabus", "pyq", "notes", "problems"]

# ── Environment Loading ───────────────────────────────────────────────────────
_env_path = pathlib.Path(__file__).resolve().parent.parent / "backend" / ".env"
load_dotenv(dotenv_path=_env_path)

def clean_val(v):
    return v.strip().strip("'").strip('"') if v else ""

URL = clean_val(os.environ.get("SUPABASE_URL"))
KEY = clean_val(os.environ.get("SUPABASE_SERVICE_ROLE_KEY"))

if not URL or not KEY:
    print("❌ [ERROR] Credentials missing in .env")
    sys.exit(1)

# ── Native Upload Function ───────────────────────────────────────────────────
def native_upload(local_path, storage_path):
    """Directly calls the Supabase Storage REST API."""
    # Construct the URL for the Storage API
    api_url = f"{URL}/storage/v1/object/{BUCKET_NAME}/{storage_path}"
    
    headers = {
        "Authorization": f"Bearer {KEY}",
        "apikey": KEY,
        "Content-Type": mimetypes.guess_type(local_path)[0] or "application/octet-stream",
        "x-upsert": "true"
    }

    try:
        with open(local_path, "rb") as f:
            response = requests.post(api_url, headers=headers, data=f)
        
        if response.status_code == 200:
            print(f"   ✅ {local_path.name}")
            return True
        else:
            print(f"   ❌ {local_path.name} failed: {response.status_code} - {response.text}")
            return False
    except Exception as e:
        print(f"   ❌ Error: {e}")
        return False

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print("🚀 Starting Native Migration to Supabase...")
    print(f"🔗 Target: {URL}")
    
    if not LOCAL_BASE_PATH.is_dir():
        print(f"❌ [ERROR] Local directory not found: {LOCAL_BASE_PATH}")
        return

    success_count = 0

    # 1. Root Syllabus
    root_syll = LOCAL_BASE_PATH / "syllabus.png"
    if root_syll.is_file():
        print("\n📤 Uploading root syllabus...")
        if native_upload(root_syll, f"{REGISTER_NUMBER}/syllabus/syllabus.png"):
            success_count += 1

    # 2. Folders
    for folder in SUB_FOLDERS:
        local_folder = LOCAL_BASE_PATH / folder
        if local_folder.is_dir():
            print(f"\n📁 Syncing: {folder}")
            for file_path in local_folder.iterdir():
                if file_path.is_file():
                    if native_upload(file_path, f"{REGISTER_NUMBER}/{folder}/{file_path.name}"):
                        success_count += 1

    print(f"\n🏁 Migration Complete! {success_count} files in Supabase.")

if __name__ == "__main__":
    main()