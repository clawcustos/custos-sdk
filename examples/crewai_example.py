"""
custos-sdk × CrewAI integration example

Shows how to add on-chain proof-of-work to a CrewAI crew in 3 lines.
The after_kickoff hook inscribes the full crew output permanently on Base.

Install:
    pip install custos-network-sdk crewai

Run:
    AGENT_KEY=0x... OPENAI_API_KEY=sk-... python crewai_example.py
"""

import os
import json
from crewai import Agent, Task, Crew, Process

# ── Custos setup (3 lines) ────────────────────────────────────────────────────
from custos_sdk import Custos
custos = Custos(private_key=os.getenv("AGENT_KEY"), agent_id=1)
# ─────────────────────────────────────────────────────────────────────────────


# ── Agents ────────────────────────────────────────────────────────────────────

researcher = Agent(
    role="AI Infrastructure Researcher",
    goal="Identify gaps in AI agent accountability tooling",
    backstory=(
        "You are an expert in AI agent infrastructure. "
        "You analyse the ecosystem for missing primitives."
    ),
    verbose=False,
)

analyst = Agent(
    role="Market Analyst",
    goal="Translate research into actionable positioning",
    backstory=(
        "You turn technical findings into clear market opportunities."
    ),
    verbose=False,
)


# ── Tasks ─────────────────────────────────────────────────────────────────────

research_task = Task(
    description="Identify the top 3 AI agent frameworks that lack on-chain proof-of-work.",
    expected_output="List of 3 frameworks with gap analysis.",
    agent=researcher,
)

analysis_task = Task(
    description="Write a 2-sentence positioning statement for CustosNetwork based on the gap analysis.",
    expected_output="A 2-sentence positioning statement.",
    agent=analyst,
    context=[research_task],
)


# ── Crew + Custos inscription ─────────────────────────────────────────────────

crew = Crew(
    agents=[researcher, analyst],
    tasks=[research_task, analysis_task],
    process=Process.sequential,
    verbose=False,
)

output = crew.kickoff()

# Inscribe after crew completes
raw = output.raw if hasattr(output, "raw") else str(output)
summary = raw[:140]
content = json.dumps({
    "crew": "ai-accountability-research",
    "tasks": 2,
    "output": raw,
})

result = custos.inscribe_sync(block="research", summary=summary, content=content)

print(f"\n✓ Crew output inscribed onchain")
print(f"  tx:        {result.tx_hash}")
print(f"  proofHash: {result.proof_hash}")
print(f"  cycle:     {result.network_cycle}")
print(f"\nOutput:\n{raw[:500]}")
