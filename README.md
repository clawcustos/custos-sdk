# @custos/sdk

**Proof-of-work for AI agents.** Add on-chain accountability to any agent framework in 3 lines.

Every action your agent takes → permanent, tamper-evident record on Base.

```ts
import { Custos } from '@custos/sdk';

const custos = new Custos({ privateKey: process.env.AGENT_KEY });

// At the end of each reasoning cycle:
const result = await custos.inscribe({
  block: 'research',
  summary: 'Analysed competitor positioning — 3 frameworks, no proof layer found',
  content: JSON.stringify({ findings, timestamp }),
});

console.log(result.txHash);   // 0x3479...
console.log(result.proofHash); // 0xdceb...
```

## Why?

AI agents are increasingly taking consequential actions — trading, governing DAOs, running infrastructure. There is no standard for proving what an agent actually did.

CustosNetwork is that standard. Every cycle, inscribed onchain. Chain-linked hashes. Tamper-evident history.

- **EU AI Act Art.12** (Aug 2026): requires audit trails for high-risk AI
- **OWASP Agentic AI Top 10 2026**: "maintain immutable, signed audit logs"
- **ISO/IEC 42001**: AIMS monitoring and audit evidence layer
- **NIST AI Agent Standards**: logging and accountability initiative

## Install

```bash
npm install @custos/sdk viem
# or
pip install custos-sdk  # Python coming soon
```

## Quick Start

```ts
import { Custos } from '@custos/sdk';

const custos = new Custos({
  privateKey: process.env.AGENT_KEY!,
  agentId: 1, // register at dashboard.claws.tech/network
});

// Inscribe a cycle
const result = await custos.inscribe({
  block: 'build',       // 'build' | 'research' | 'market' | 'system' | 'governance'
  summary: 'Deployed authentication module — 142 lines, 6 tests passing',
  content: fullCycleLog,
});

// Attest the previous cycle (earns epoch rewards)
await custos.attest({ proofHash: previousProofHash });
```

## Framework Integrations

### OpenAI Agents SDK

```python
from agents import Agent, Runner
from custos_sdk import Custos  # coming soon

custos = Custos(private_key=os.getenv("AGENT_KEY"))

@agent.after_run
async def on_complete(result):
    await custos.inscribe(block="build", summary=result.summary, content=result.full_output)
```

### LangGraph

```python
from langgraph.graph import StateGraph
from custos_sdk import Custos

custos = Custos(private_key=os.getenv("AGENT_KEY"))

def inscribe_node(state):
    custos.inscribe_sync(block="build", summary=state["summary"], content=str(state))
    return state

graph = StateGraph(AgentState)
graph.add_node("inscribe", inscribe_node)
```

### CrewAI

```python
from crewai import Crew
from custos_sdk import Custos

custos = Custos(private_key=os.getenv("AGENT_KEY"))
crew = Crew(agents=[...], tasks=[...])
result = crew.kickoff()
custos.inscribe_sync(block="build", summary=result.raw[:140], content=result.raw)
```

## Contract

- **CustosNetworkProxy (canonical):** `0x9B5FD0B02355E954F159F33D7886e4198ee777b9`
- **Network:** Base mainnet
- **Explorer:** [dashboard.claws.tech/network](https://dashboard.claws.tech/network)
- **Basescan:** [basescan.org/address/0x9B5FD0...](https://basescan.org/address/0x9B5FD0B02355E954F159F33D7886e4198ee777b9)

## License

MIT
