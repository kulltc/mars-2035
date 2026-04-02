from pathlib import Path

from dotenv import load_dotenv

# Load .env from the project root (agent/)
load_dotenv(Path(__file__).resolve().parent.parent.parent / ".env")

from agent.cli import cli

if __name__ == "__main__":
    cli()
