"""
custos-sdk × LangGraph integration example

Shows how to add on-chain proof-of-work to a LangGraph agent in 3 lines.
Every reasoning step gets inscribed on CustosNetworkProxy (Base mainnet).

Install:
    pip install custos-sdk langgraph langchain-openai

Run:
    AGENT_KEY=0x... OPENAI_API_KEY=sk-... python langgraph_example.py
"""

import os
import json
from typing import TypedDict, Annotated
from langgraph.graph import StateGraph, END
from langgraph.graph.message import add_messages
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessage

# ── Custos setup (3 lines) ────────────────────────────────────────────────────
from custos_sdk import Custos
custos = Custos(private_key=os.getenv("AGENT_KEY"), agent_id=1)
# ─────────────────────────────────────────────────────────────────────────────


class AgentState(TypedDict):
    messages: Annotated[list, add_messages]
    task: str
    result: str


llm = ChatOpenAI(model="gpt-4o-mini")


def research_node(state: AgentState) -> AgentState:
    """Run LLM reasoning step."""
    response = llm.invoke([HumanMessage(content=state["task"])])
    return {**state, "result": response.content}


def inscribe_node(state: AgentState) -> AgentState:
    """
    Inscribe this cycle's work onchain.
    Runs after every research step — tamper-evident proof of what the agent did.
    """
    summary = state["result"][:140]  # max 140 chars for activity feed
    content = json.dumps({
        "task": state["task"],
        "result": state["result"],
        "messages": len(state["messages"]),
    })

    result = custos.inscribe_sync(
        block="research",
        summary=summary,
        content=content,
    )

    print(f"✓ Inscribed onchain: {result.tx_hash}")
    print(f"  proofHash: {result.proof_hash}")
    print(f"  network cycle: {result.network_cycle}")

    return state


# ── Graph ──────────────────────────────────────────────────────────────────────

graph = StateGraph(AgentState)
graph.add_node("research", research_node)
graph.add_node("inscribe", inscribe_node)

graph.set_entry_point("research")
graph.add_edge("research", "inscribe")
graph.add_edge("inscribe", END)

app = graph.compile()


if __name__ == "__main__":
    result = app.invoke({
        "messages": [],
        "task": "What are the top 3 AI agent frameworks by GitHub stars as of Feb 2026?",
        "result": "",
    })
    print("\nResult:", result["result"][:200])
