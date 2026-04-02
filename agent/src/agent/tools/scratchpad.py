"""Per-agent scratchpad tool for strategy notes and observations."""

from __future__ import annotations

from pathlib import Path
from typing import Literal

from langchain_core.tools import tool


def create_scratchpad_tool(data_dir: Path):
    """Create a scratchpad tool bound to a specific agent's data directory."""

    pad_path = data_dir / "scratchpad.md"

    @tool
    def scratchpad(
        action: Literal["read", "write", "append"],
        content: str | None = None,
    ) -> str:
        """Manage your strategy scratchpad for recording observations, plans, and notes.

        Actions:
        - read: Read the full scratchpad content
        - write: Overwrite the scratchpad with new content
        - append: Append content to the scratchpad (adds a newline separator)
        """
        if action == "read":
            if not pad_path.exists() or pad_path.stat().st_size == 0:
                return "Scratchpad is empty. Write your strategy notes and observations here."
            return pad_path.read_text()

        elif action == "write":
            if content is None:
                return "Error: 'content' is required for write action."
            pad_path.write_text(content)
            return f"Scratchpad updated ({len(content)} chars)."

        elif action == "append":
            if content is None:
                return "Error: 'content' is required for append action."
            existing = pad_path.read_text() if pad_path.exists() else ""
            separator = "\n\n" if existing else ""
            pad_path.write_text(existing + separator + content)
            return f"Appended to scratchpad ({len(content)} chars added)."

        return f"Unknown action: {action}"

    return scratchpad
