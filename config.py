
import os
from dotenv import load_dotenv

# Project's main directory
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Load environment variables
ENV_PATH = os.path.join(BASE_DIR, ".env")
load_dotenv(ENV_PATH, override=True)


class Config:
    # Flask security key
    SECRET_KEY = os.getenv(
        "SECRET_KEY",
        "astra-health-360-development-key"
    )

    # SQLite database location
    DATABASE_PATH = os.path.join(
        BASE_DIR,
        "database",
        "astra_health.db"
    )

    # Local Ollama configuration
    OLLAMA_URL = os.getenv(
        "OLLAMA_URL",
        "http://localhost:11434/api/chat"
    )

    OLLAMA_MODEL = os.getenv(
        "OLLAMA_MODEL",
        "llama3.2:3b"
    )

    # Application settings
    DEBUG = os.getenv("FLASK_DEBUG", "true").lower() == "true"

    JSON_SORT_KEYS = False
