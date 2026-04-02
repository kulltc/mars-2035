"""Per-agent todo list tool for task planning and tracking."""

from __future__ import annotations

import json
import uuid
from pathlib import Path
from typing import Literal

from langchain_core.tools import tool


def create_todo_tool(data_dir: Path):
    """Create a todo list tool bound to a specific agent's data directory."""

    todo_path = data_dir / "todos.json"

    def _load() -> list[dict]:
        if not todo_path.exists():
            return []
        return json.loads(todo_path.read_text())

    def _save(todos: list[dict]):
        todo_path.write_text(json.dumps(todos, indent=2))

    @tool
    def todo(
        action: Literal["read", "add", "update", "clear_done"],
        text: str | None = None,
        priority: Literal["high", "medium", "low"] = "medium",
        todo_id: str | None = None,
        status: Literal["pending", "in_progress", "done", "cancelled"] | None = None,
    ) -> str:
        """Manage your todo list for tracking objectives and progress.

        Actions:
        - read: List all todos with their status
        - add: Add a new todo (requires 'text', optional 'priority')
        - update: Update a todo's status (requires 'todo_id' and 'status')
        - clear_done: Remove all completed/cancelled todos
        """
        todos = _load()

        if action == "read":
            if not todos:
                return "Todo list is empty. Add tasks to track your objectives."
            lines = []
            for t in todos:
                marker = {"pending": "[ ]", "in_progress": "[~]", "done": "[x]", "cancelled": "[-]"}
                lines.append(
                    f"{marker.get(t['status'], '[ ]')} [{t['priority']}] {t['text']}  (id: {t['id']})"
                )
            return "\n".join(lines)

        elif action == "add":
            if not text:
                return "Error: 'text' is required for add action."
            new_todo = {
                "id": uuid.uuid4().hex[:8],
                "text": text,
                "priority": priority,
                "status": "pending",
            }
            todos.append(new_todo)
            _save(todos)
            return f"Added todo: {new_todo['text']} (id: {new_todo['id']})"

        elif action == "update":
            if not todo_id or not status:
                return "Error: 'todo_id' and 'status' are required for update action."
            for t in todos:
                if t["id"] == todo_id:
                    t["status"] = status
                    _save(todos)
                    return f"Updated todo {todo_id} to {status}."
            return f"Error: todo {todo_id} not found."

        elif action == "clear_done":
            before = len(todos)
            todos = [t for t in todos if t["status"] not in ("done", "cancelled")]
            _save(todos)
            removed = before - len(todos)
            return f"Cleared {removed} completed/cancelled todos. {len(todos)} remaining."

        return f"Unknown action: {action}"

    return todo
