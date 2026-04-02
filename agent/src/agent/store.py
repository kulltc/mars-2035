"""Agent registry with JSON file persistence and file locking."""

from __future__ import annotations

import fcntl
import json
import uuid
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from agent.config import DATA_DIR, STORE_FILE


@dataclass
class AgentRecord:
    agent_id: str
    name: str
    username: str
    password: str
    thread_id: str
    status: str = "pending"  # pending | running | paused | stopped | error
    pid: int | None = None
    created_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    last_active_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    error_message: str | None = None


def _ensure_dirs():
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def _load_raw() -> dict[str, dict]:
    _ensure_dirs()
    if not STORE_FILE.exists():
        return {}
    return json.loads(STORE_FILE.read_text())


def _save_raw(data: dict[str, dict]):
    _ensure_dirs()
    STORE_FILE.write_text(json.dumps(data, indent=2))


def _with_lock(fn):
    """Decorator that acquires an exclusive file lock around store operations."""
    def wrapper(*args, **kwargs):
        _ensure_dirs()
        lock_path = STORE_FILE.with_suffix(".lock")
        with open(lock_path, "w") as lock_file:
            fcntl.flock(lock_file, fcntl.LOCK_EX)
            try:
                return fn(*args, **kwargs)
            finally:
                fcntl.flock(lock_file, fcntl.LOCK_UN)
    return wrapper


@_with_lock
def add_agent(name: str, username: str, password: str) -> AgentRecord:
    agents = _load_raw()
    record = AgentRecord(
        agent_id=uuid.uuid4().hex[:12],
        name=name,
        username=username,
        password=password,
        thread_id=uuid.uuid4().hex,
    )
    agents[record.agent_id] = asdict(record)

    # Create per-agent data directory
    agent_dir = DATA_DIR / record.agent_id
    agent_dir.mkdir(parents=True, exist_ok=True)
    (agent_dir / "todos.json").write_text("[]")
    (agent_dir / "scratchpad.md").write_text("")

    _save_raw(agents)
    return record


@_with_lock
def get_agent(agent_id: str) -> AgentRecord | None:
    agents = _load_raw()
    data = agents.get(agent_id)
    if data is None:
        return None
    return AgentRecord(**data)


@_with_lock
def update_agent(agent_id: str, **kwargs) -> AgentRecord | None:
    agents = _load_raw()
    if agent_id not in agents:
        return None
    agents[agent_id].update(kwargs)
    _save_raw(agents)
    return AgentRecord(**agents[agent_id])


@_with_lock
def delete_agent(agent_id: str) -> bool:
    agents = _load_raw()
    if agent_id not in agents:
        return False
    del agents[agent_id]
    _save_raw(agents)
    return True


@_with_lock
def list_agents() -> list[AgentRecord]:
    agents = _load_raw()
    return [AgentRecord(**data) for data in agents.values()]


def get_agent_dir(agent_id: str) -> Path:
    return DATA_DIR / agent_id
