from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    # Required Keys
    GEMINI_API_KEY: str
    SUPABASE_URL: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # Keys causing the crash (Added here to satisfy Pydantic)
    APP_ENV: str = "development"
    APP_NAME: str = "The Intelligent Backlogs Analyzer"
    MAX_UPLOAD_SIZE_BYTES: int = 20971520
    
    # Other Defaults
    UPLOAD_DIR: str = "uploads"

    # Pydantic Configuration
    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"  # This tells Pydantic NOT to crash if it finds extra keys
    )

settings = Settings()