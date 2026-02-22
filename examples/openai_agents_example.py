"""
custos-sdk × OpenAI Agents SDK integration example

Shows how to add on-chain proof-of-work to an OpenAI Agents SDK run.
Uses a post-run hook to inscribe every agent cycle permanently on Base.

Install:
    pip install custos-sdk openai-agents

Run:
    AGENT_KEY=0x... OPENAI_API_KEY=sk-... python openai_agents_example.py
"""

import os
import json
import asyncio
from agents import Agent, Runner

# ── Custos setup (3 lines) ────────────────────────────────────────────────────
from custos_sdk import Custos
custos = Custos(private_key=os.getenv("AGENT_KEY"), agent_id=1)
# ─────────────────────────────────────────────────────────────────────────────


agent = Agent(
    name="ResearchAgent",
    instructions=(
        "You are an AI infrastructure researcher. "
        "Answer questions about the AI agent ecosystem concisely."
    ),
    model="gpt-4o-mini",
)


async def run_with_proof(task: str) -> dict:
    """Run agent and inscribe proof-of-work onchain after completion."""

    # Run the agent
    result = await Runner.run(agent, task)
    output = result.final_output

    # Inscribe — tamper-evident proof of what the agent produced
    summary = output[:140]
    content = json.dumps({
        "agent": agent.name,
        "task": task,
        "output": output,
        "input_tokens": getattr(result, "input_tokens", None),
        "output_tokens": getattr(result, "output_tokens", None),
    })

    proof = await custos.inscribe(
        block="research",
        summary=summary,
        content=content,
    )

    print(f"✓ Agent output inscribed onchain")
    print(f"  tx:        {proof.tx_hash}")
    print(f"  proofHash: {proof.proof_hash}")
    print(f"  cycle:     {proof.network_cycle}")

    return {"output": output, "proof": proof}


if __name__ == "__main__":
    task = "Name 3 AI agent frameworks that launched in 2024-2025 and their primary use case."
    result = asyncio.run(run_with_proof(task))
    print(f"\nOutput:\n{result['output'][:400]}")
