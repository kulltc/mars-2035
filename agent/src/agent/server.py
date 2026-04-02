"""FastAPI admin server for Mars 2035 agents."""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from dataclasses import asdict
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from agent.auth import login
from agent.config import DATA_DIR, GAME_CLIENT_URL, GAME_SERVER_URL
from agent.store import (
    add_agent,
    delete_agent,
    get_agent,
    get_agent_dir,
    list_agents,
    update_agent,
)
from agent.trace import list_traces, load_trace

logger = logging.getLogger(__name__)

app = FastAPI(title="Mars 2035 Agent Admin")

# Serve static files
_static_dir = Path(__file__).resolve().parent.parent.parent / "static"
if _static_dir.exists():
    app.mount("/static", StaticFiles(directory=_static_dir), name="static")

# Track running turns to prevent concurrent execution
_running_turns: dict[str, asyncio.Task] = {}


# ---------- Pydantic models ----------

class AddAgentRequest(BaseModel):
    name: str
    username: str
    password: str


# ---------- Routes ----------

@app.get("/")
async def index():
    return FileResponse(_static_dir / "index.html")


@app.get("/api/agents")
async def api_list_agents():
    agents = list_agents()
    result = []
    for a in agents:
        d = asdict(a)
        d.pop("password", None)
        # Check if a turn is currently running
        task = _running_turns.get(a.agent_id)
        if task and not task.done():
            d["status"] = "running"
        result.append(d)
    return result


@app.post("/api/agents")
async def api_add_agent(req: AddAgentRequest):
    record = add_agent(req.name, req.username, req.password)
    d = asdict(record)
    d.pop("password", None)
    return d


@app.get("/api/agents/{agent_id}")
async def api_get_agent(agent_id: str):
    record = get_agent(agent_id)
    if not record:
        raise HTTPException(404, "Agent not found")
    d = asdict(record)
    d.pop("password", None)

    # Check if turn is running
    task = _running_turns.get(agent_id)
    if task and not task.done():
        d["status"] = "running"

    # Include todos
    agent_dir = get_agent_dir(agent_id)
    todo_file = agent_dir / "todos.json"
    d["todos"] = json.loads(todo_file.read_text()) if todo_file.exists() else []

    # Include scratchpad
    pad_file = agent_dir / "scratchpad.md"
    d["scratchpad"] = pad_file.read_text() if pad_file.exists() else ""

    return d


@app.post("/api/agents/{agent_id}/pause")
async def api_pause_agent(agent_id: str):
    record = get_agent(agent_id)
    if not record:
        raise HTTPException(404, "Agent not found")
    update_agent(agent_id, status="paused")
    return {"status": "paused"}


@app.post("/api/agents/{agent_id}/resume")
async def api_resume_agent(agent_id: str):
    record = get_agent(agent_id)
    if not record:
        raise HTTPException(404, "Agent not found")
    update_agent(agent_id, status="pending", error_message=None)
    return {"status": "pending"}


@app.delete("/api/agents/{agent_id}")
async def api_delete_agent(agent_id: str):
    record = get_agent(agent_id)
    if not record:
        raise HTTPException(404, "Agent not found")
    agent_dir = get_agent_dir(agent_id)
    if agent_dir.exists():
        shutil.rmtree(agent_dir)
    delete_agent(agent_id)
    return {"deleted": True}


@app.post("/api/agents/{agent_id}/run")
async def api_run_turn(agent_id: str):
    record = get_agent(agent_id)
    if not record:
        raise HTTPException(404, "Agent not found")
    if record.status == "paused":
        raise HTTPException(400, "Agent is paused")

    # Check for already running turn
    task = _running_turns.get(agent_id)
    if task and not task.done():
        raise HTTPException(409, "Turn already in progress")

    task = asyncio.create_task(_execute_turn(record))
    _running_turns[agent_id] = task
    return {"status": "started"}


async def _execute_turn(record):
    """Background task to execute a single turn."""
    from agent.core import run_turn

    try:
        await run_turn(record)
    except Exception as e:
        logger.exception("Turn failed for %s", record.name)
        update_agent(record.agent_id, status="error", error_message=str(e))


@app.get("/api/agents/{agent_id}/turns")
async def api_list_turns(agent_id: str):
    record = get_agent(agent_id)
    if not record:
        raise HTTPException(404, "Agent not found")
    return list_traces(agent_id)


@app.get("/api/agents/{agent_id}/turns/{turn_number}")
async def api_get_turn(agent_id: str, turn_number: int):
    record = get_agent(agent_id)
    if not record:
        raise HTTPException(404, "Agent not found")
    trace = load_trace(agent_id, turn_number)
    if trace is None:
        raise HTTPException(404, "Turn not found")
    return trace


@app.get("/api/agents/{agent_id}/login-token")
async def api_login_token(agent_id: str):
    record = get_agent(agent_id)
    if not record:
        raise HTTPException(404, "Agent not found")
    try:
        token = await login(GAME_SERVER_URL, record.username, record.password)
        return {"token": token, "client_url": GAME_CLIENT_URL}
    except Exception as e:
        raise HTTPException(500, f"Login failed: {e}")
