"""CLI for managing Mars 2035 game-playing agents."""

from __future__ import annotations

import json
import logging
import shutil
import sys

import click

from agent.store import (
    add_agent,
    delete_agent,
    get_agent,
    get_agent_dir,
    list_agents,
    update_agent,
)


@click.group()
@click.option("--verbose", "-v", is_flag=True, help="Enable debug logging")
def cli(verbose: bool):
    """Mars 2035 autonomous agent manager."""
    level = logging.DEBUG if verbose else logging.INFO
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )


@cli.command()
@click.option("--name", "-n", required=True, help="Agent display name")
@click.option("--username", "-u", required=True, help="Game account username")
@click.option("--password", "-p", required=True, help="Game account password")
def add(name: str, username: str, password: str):
    """Add a new agent."""
    record = add_agent(name, username, password)
    click.echo(f"Created agent {record.name} (id: {record.agent_id})")
    click.echo(f"  Username: {record.username}")
    click.echo(f"  Status:   {record.status}")
    click.echo(f"\nRun a turn:  python -m agent run {record.agent_id}")


@cli.command("list")
def list_cmd():
    """List all agents."""
    agents = list_agents()
    if not agents:
        click.echo("No agents registered. Use 'add' to create one.")
        return

    # Header
    click.echo(f"{'ID':<14} {'Name':<20} {'Status':<10} {'Username':<16} {'Last Active'}")
    click.echo("-" * 80)
    for a in agents:
        last = a.last_active_at[:19] if a.last_active_at else "never"
        click.echo(f"{a.agent_id:<14} {a.name:<20} {a.status:<10} {a.username:<16} {last}")


@cli.command()
@click.argument("agent_id")
def status(agent_id: str):
    """Show detailed status for an agent."""
    record = get_agent(agent_id)
    if not record:
        click.echo(f"Agent {agent_id} not found.", err=True)
        sys.exit(1)

    click.echo(f"Agent:       {record.name} ({record.agent_id})")
    click.echo(f"Status:      {record.status}")
    click.echo(f"Username:    {record.username}")
    click.echo(f"Thread ID:   {record.thread_id}")
    click.echo(f"Created:     {record.created_at}")
    click.echo(f"Last Active: {record.last_active_at}")
    if record.error_message:
        click.echo(f"Error:       {record.error_message}")

    # Show todos
    agent_dir = get_agent_dir(agent_id)
    todo_file = agent_dir / "todos.json"
    if todo_file.exists():
        todos = json.loads(todo_file.read_text())
        if todos:
            click.echo(f"\nTodos ({len(todos)}):")
            for t in todos:
                marker = {"pending": "[ ]", "in_progress": "[~]", "done": "[x]", "cancelled": "[-]"}
                click.echo(f"  {marker.get(t['status'], '[ ]')} [{t['priority']}] {t['text']}")

    # Show scratchpad excerpt
    pad_file = agent_dir / "scratchpad.md"
    if pad_file.exists() and pad_file.stat().st_size > 0:
        content = pad_file.read_text()
        click.echo(f"\nScratchpad ({len(content)} chars):")
        # Show first 500 chars
        preview = content[:500]
        if len(content) > 500:
            preview += "\n... (truncated)"
        for line in preview.split("\n"):
            click.echo(f"  {line}")


@cli.command()
@click.argument("agent_id")
def pause(agent_id: str):
    """Pause an agent (skip on next run)."""
    record = get_agent(agent_id)
    if not record:
        click.echo(f"Agent {agent_id} not found.", err=True)
        sys.exit(1)
    update_agent(agent_id, status="paused")
    click.echo(f"Paused agent {record.name} ({agent_id})")


@cli.command()
@click.argument("agent_id")
def resume(agent_id: str):
    """Resume a paused agent."""
    record = get_agent(agent_id)
    if not record:
        click.echo(f"Agent {agent_id} not found.", err=True)
        sys.exit(1)
    update_agent(agent_id, status="pending", error_message=None)
    click.echo(f"Resumed agent {record.name} ({agent_id})")


@cli.command("delete")
@click.argument("agent_id")
@click.option("--yes", "-y", is_flag=True, help="Skip confirmation")
def delete_cmd(agent_id: str, yes: bool):
    """Delete an agent and its data."""
    record = get_agent(agent_id)
    if not record:
        click.echo(f"Agent {agent_id} not found.", err=True)
        sys.exit(1)

    if not yes:
        click.confirm(f"Delete agent {record.name} ({agent_id}) and all its data?", abort=True)

    # Remove data directory
    agent_dir = get_agent_dir(agent_id)
    if agent_dir.exists():
        shutil.rmtree(agent_dir)

    delete_agent(agent_id)
    click.echo(f"Deleted agent {record.name} ({agent_id})")


@cli.command()
@click.argument("agent_id", required=False)
@click.option("--all", "-a", "run_all", is_flag=True, help="Run all non-paused agents")
def run(agent_id: str | None, run_all: bool):
    """Run one turn for an agent (or all non-paused agents with --all)."""
    from agent.core import run_turn_sync

    if not agent_id and not run_all:
        click.echo("Specify an agent ID or use --all to run all agents.", err=True)
        sys.exit(1)

    if run_all:
        agents = list_agents()
        targets = [a for a in agents if a.status not in ("paused", "stopped")]
        if not targets:
            click.echo("No runnable agents found.")
            return
        click.echo(f"Running {len(targets)} agent(s)...")
        for record in targets:
            _run_one(record, run_turn_sync)
    else:
        record = get_agent(agent_id)
        if not record:
            click.echo(f"Agent {agent_id} not found.", err=True)
            sys.exit(1)
        if record.status == "paused":
            click.echo(f"Agent {record.name} is paused. Use 'resume' first.", err=True)
            sys.exit(1)
        _run_one(record, run_turn_sync)


def _run_one(record, run_fn):
    """Run a single turn for one agent with error handling."""
    click.echo(f"\n{'='*60}")
    click.echo(f"Running turn for: {record.name} ({record.agent_id})")
    click.echo(f"{'='*60}")
    try:
        trace = run_fn(record)
        tokens = trace.usage.get("total_tokens", 0) if trace.usage else 0
        tool_count = sum(len(s.tool_calls) for s in trace.steps if s.tool_calls)
        click.echo(f"\nTurn {trace.turn_number} complete for {record.name}.")
        click.echo(f"  Tool calls: {tool_count}  |  Tokens: {tokens}")
        click.echo(f"\nAgent response:\n{trace.final_response}")
    except Exception as e:
        error_msg = str(e)
        click.echo(f"\nError running {record.name}: {error_msg}", err=True)
        update_agent(record.agent_id, status="error", error_message=error_msg)


@cli.command()
@click.option("--host", default="0.0.0.0", help="Bind address")
@click.option("--port", default=8080, type=int, help="Port number")
def serve(host: str, port: int):
    """Start the admin web UI server."""
    import uvicorn
    from agent.server import app
    uvicorn.run(app, host=host, port=port)
