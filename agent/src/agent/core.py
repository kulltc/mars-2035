"""Core agent creation and turn execution using deepagents."""

from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from deepagents import create_deep_agent
from langchain_mcp_adapters.client import MultiServerMCPClient
from langgraph.checkpoint.memory import MemorySaver

from agent.auth import login
from agent.config import GAME_SERVER_URL, LLM_MODEL, MCP_SERVER_URL
from agent.prompt import SYSTEM_PROMPT
from agent.store import AgentRecord, get_agent_dir, update_agent
from agent.tools.scratchpad import create_scratchpad_tool
from agent.tools.todo import create_todo_tool
from agent.trace import get_next_turn_number, messages_to_trace, save_trace, TurnTrace

logger = logging.getLogger(__name__)

# Shared checkpointer — persists agent state across turns within process lifetime.
# For cross-process persistence, replace with SqliteSaver or PostgresSaver.
_checkpointer = MemorySaver()


async def run_turn(record: AgentRecord) -> TurnTrace:
    """Run a single turn for an agent. Returns the turn trace."""

    # 1. Authenticate
    logger.info("Logging in as %s ...", record.username)
    jwt_token = await login(GAME_SERVER_URL, record.username, record.password)

    # 2. Connect to MCP server and load game tools
    mcp_client = MultiServerMCPClient(
        {
            "mars2035": {
                "url": MCP_SERVER_URL,
                "transport": "streamable_http",
                "headers": {"Authorization": f"Bearer {jwt_token}"},
            }
        }
    )
    mcp_tools = await mcp_client.get_tools()
    logger.info("Loaded %d MCP tools", len(mcp_tools))

    # 3. Create per-agent custom tools
    agent_dir = get_agent_dir(record.agent_id)
    todo_tool = create_todo_tool(agent_dir)
    scratchpad_tool = create_scratchpad_tool(agent_dir)

    all_tools = mcp_tools + [todo_tool, scratchpad_tool]

    # 4. Create the deep agent
    agent = create_deep_agent(
        model=LLM_MODEL,
        tools=all_tools,
        system_prompt=SYSTEM_PROMPT,
        checkpointer=_checkpointer,
        name=record.name,
    )

    # 5. Invoke a single turn
    config = {"configurable": {"thread_id": record.thread_id}}
    tick_message = (
        "New turn. You have ~20 tool calls. "
        "Start by reading your scratchpad and todos, check game state, "
        "take actions, then update scratchpad and todos for next turn."
    )

    turn_number = get_next_turn_number(record.agent_id)
    started_at = datetime.now(timezone.utc).isoformat()

    logger.info("Invoking agent turn %d for %s ...", turn_number, record.name)
    update_agent(record.agent_id, status="running",
                 last_active_at=datetime.now(timezone.utc).isoformat())

    result = await agent.ainvoke(
        {"messages": [{"role": "user", "content": tick_message}]},
        config=config,
    )

    # 6. Extract turn trace and save
    trace = messages_to_trace(result.get("messages", []), turn_number, started_at)
    save_trace(record.agent_id, trace)

    logger.info("Turn %d complete for %s (%d tokens)", turn_number, record.name, trace.usage.get("total_tokens", 0))
    update_agent(
        record.agent_id,
        status="pending",
        last_active_at=datetime.now(timezone.utc).isoformat(),
        error_message=None,
    )
    return trace


def run_turn_sync(record: AgentRecord) -> str:
    """Synchronous wrapper for run_turn."""
    return asyncio.run(run_turn(record))
