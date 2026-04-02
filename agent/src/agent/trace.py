"""Turn trace capture and persistence."""

from __future__ import annotations

import json
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from agent.config import DATA_DIR


@dataclass
class TraceStep:
    type: str  # "ai" or "tool"
    content: str = ""
    tool_calls: list[dict] | None = None
    tool_call_id: str | None = None
    name: str | None = None
    usage: dict | None = None


@dataclass
class TurnTrace:
    turn_number: int
    started_at: str
    finished_at: str
    status: str  # "completed" or "error"
    error: str | None
    usage: dict = field(default_factory=lambda: {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0})
    steps: list[TraceStep] = field(default_factory=list)
    final_response: str = ""


def _turns_dir(agent_id: str) -> Path:
    d = DATA_DIR / agent_id / "turns"
    d.mkdir(parents=True, exist_ok=True)
    return d


def get_next_turn_number(agent_id: str) -> int:
    index = list_traces(agent_id)
    return len(index) + 1


def messages_to_trace(messages: list, turn_number: int, started_at: str) -> TurnTrace:
    """Extract a TurnTrace from the LangChain message list returned by ainvoke().

    Since MemorySaver accumulates messages across turns, we only take messages
    after the last HumanMessage (which is our tick prompt).
    """
    from langchain_core.messages import AIMessage, HumanMessage, ToolMessage

    # Find the last HumanMessage index — everything after it is this turn
    last_human_idx = 0
    for i, msg in enumerate(messages):
        if isinstance(msg, HumanMessage):
            last_human_idx = i

    turn_messages = messages[last_human_idx + 1:]

    steps = []
    total_usage = {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    final_response = ""

    for msg in turn_messages:
        if isinstance(msg, AIMessage):
            usage = None
            if msg.usage_metadata:
                usage = {
                    "input_tokens": msg.usage_metadata.get("input_tokens", 0),
                    "output_tokens": msg.usage_metadata.get("output_tokens", 0),
                    "total_tokens": msg.usage_metadata.get("total_tokens", 0),
                }
                for k in total_usage:
                    total_usage[k] += usage.get(k, 0)

            tool_calls = None
            if msg.tool_calls:
                tool_calls = [
                    {"id": tc["id"], "name": tc["name"], "args": tc["args"]}
                    for tc in msg.tool_calls
                ]

            # Extract text content — Claude returns a list of content blocks
            if isinstance(msg.content, list):
                text_parts = [
                    block["text"] for block in msg.content
                    if isinstance(block, dict) and block.get("type") == "text"
                ]
                content = "\n".join(text_parts)
            else:
                content = msg.content or ""

            steps.append(TraceStep(type="ai", content=content, tool_calls=tool_calls, usage=usage))
            # The last AI message without tool calls is the final response
            if not msg.tool_calls:
                final_response = content

        elif isinstance(msg, ToolMessage):
            content = msg.content if isinstance(msg.content, str) else str(msg.content)
            steps.append(TraceStep(
                type="tool",
                content=content,
                tool_call_id=msg.tool_call_id,
                name=msg.name,
            ))

    return TurnTrace(
        turn_number=turn_number,
        started_at=started_at,
        finished_at=datetime.now(timezone.utc).isoformat(),
        status="completed",
        error=None,
        usage=total_usage,
        steps=steps,
        final_response=final_response,
    )


def save_trace(agent_id: str, trace: TurnTrace) -> None:
    """Save a turn trace to disk and update the index."""
    turns = _turns_dir(agent_id)
    filename = f"{trace.turn_number:04d}.json"
    (turns / filename).write_text(json.dumps(asdict(trace), indent=2))

    # Update index
    index = list_traces(agent_id)
    index.append({
        "turn_number": trace.turn_number,
        "started_at": trace.started_at,
        "status": trace.status,
        "total_tokens": trace.usage.get("total_tokens", 0),
        "tool_call_count": sum(
            len(s.tool_calls) for s in trace.steps if s.tool_calls
        ),
    })
    (turns / "index.json").write_text(json.dumps(index, indent=2))


def load_trace(agent_id: str, turn_number: int) -> dict | None:
    """Load a single turn trace."""
    path = _turns_dir(agent_id) / f"{turn_number:04d}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def list_traces(agent_id: str) -> list[dict]:
    """Load the turn index (summaries only)."""
    path = _turns_dir(agent_id) / "index.json"
    if not path.exists():
        return []
    return json.loads(path.read_text())
