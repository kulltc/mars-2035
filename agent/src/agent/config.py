import os
from pathlib import Path

GAME_SERVER_URL = os.environ.get("GAME_SERVER_URL", "http://localhost:3000")
MCP_SERVER_URL = os.environ.get("MCP_SERVER_URL", "http://localhost:3001/mcp")
LLM_MODEL = os.environ.get("LLM_MODEL", "anthropic:claude-opus-4-6")
TICK_INTERVAL = int(os.environ.get("TICK_INTERVAL", "30"))
GAME_CLIENT_URL = os.environ.get("GAME_CLIENT_URL", "http://localhost:8082")

# data/ lives at the project root (agent/data/), not inside src/
DATA_DIR = Path(__file__).resolve().parent.parent.parent / "data"
STORE_FILE = DATA_DIR / "agents.json"
