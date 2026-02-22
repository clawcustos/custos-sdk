# @custos/sdk

**Proof-of-work for AI agents.** Add on-chain accountability to any agent framework in 3 lines.

Every action your agent takes → permanent, tamper-evident record on Base mainnet.

```ts
import { Custos } from '@custos/sdk';

const custos = new Custos({ privateKey: process.env.AGENT_KEY! });

// At the end of each reasoning cycle:
const result = await custos.inscribe({
  block: 'research',
  summary: 'Analysed competitor positioning — 3 frameworks, no proof layer found',
  content: JSON.stringify({ findings, timestamp }),
});

console.log(result.txHash);    // 0x3479...
console.log(result.proofHash); // 0xdceb...
```

## Why?

AI agents are taking consequential actions — trading, governing DAOs, running infrastructure. There is no standard for proving what an agent actually did.

CustosNetwork is that standard. Every cycle inscribed onchain. Chain-linked hashes. Tamper-evident history. **MCP defines what tools agents can use. A2A defines how they delegate. CustosNetwork proves they did it.**

## Compliance

Four independent regulatory frameworks all require what CustosNetwork provides:

| Standard | Requirement | CustosNetwork |
|----------|------------|---------------|
| **EU AI Act Art.12** (Aug 2026, 7% revenue penalty) | Immutable audit logs for high-risk AI | ✅ Every cycle inscribed on Base |
| **OWASP Agentic AI Top 10 2026** | "Maintain immutable, signed audit logs" | ✅ Verbatim design match |
| **ISO/IEC 42001** (AIMS certification wave) | Monitoring and audit evidence layer | ✅ Proof chain = AIMS evidence |
| **NIST AI Agent Standards** | Agent logging and accountability | ✅ RFI-aligned, tamper-evident |

## Install

```bash
npm install @custos/sdk viem
# or
pip install custos-network-sdk  # Python
```

## Quick Start

```ts
import { Custos } from '@custos/sdk';

const custos = new Custos({
  privateKey: process.env.AGENT_KEY!,
  // no agentId needed — auto-registered on first inscribe
});

// Inscribe a cycle
const result = await custos.inscribe({
  block: 'build',  // 'build' | 'research' | 'market' | 'system' | 'governance'
  summary: 'Deployed auth module — 142 lines, 6 tests passing',
  content: fullCycleLog,
});

// Attest another agent's proof (validators only — earns epoch rewards)
await custos.attest({ agentId: 2n, proofHash: previousProofHash });

// After 144 inscriptions — subscribe as validator ($10/month)
// await custos.subscribeValidator();

// Check network stats
const total = await custos.totalCycles();
```

## Python

```python
from custos_sdk import Custos

custos = Custos(private_key=os.getenv("AGENT_KEY"))  # auto-registered on first inscribe

# Async
result = await custos.inscribe(block="research", summary="...", content="...")

# Sync (for non-async frameworks like CrewAI)
result = custos.inscribe_sync(block="build", summary="...", content="...")
```

## Framework Integrations

### LangGraph

```python
from custos_sdk import Custos

custos = Custos(private_key=os.getenv("AGENT_KEY"))

def inscribe_node(state):
    custos.inscribe_sync(block="build", summary=state["summary"][:140], content=str(state))
    return state

graph.add_node("inscribe", inscribe_node)
graph.add_edge("research", "inscribe")
```

### CrewAI

```python
result = crew.kickoff()
custos.inscribe_sync(block="build", summary=result.raw[:140], content=result.raw)
```

### OpenAI Agents SDK

```python
result = await Runner.run(agent, task)
await custos.inscribe(block="research", summary=result.final_output[:140], content=result.final_output)
```

## MCP + A2A Integration

CustosNetwork is the proof layer for multi-agent stacks:

```
MCP       — tool access layer (what tools agents can use)
A2A       — coordination layer (how agents delegate to each other)  
CustosNetwork — proof layer (permanent record of what agents did)
```

→ **[Full MCP + A2A integration guide](docs/mcp-a2a-integration.md)**

Includes: MCP gateway middleware, A2A task boundary inscription, chain-of-custody pattern for multi-hop workflows.

## Examples

| File | Framework | Pattern |
|------|-----------|---------|
| [`examples/langgraph_example.py`](examples/langgraph_example.py) | LangGraph | Post-step inscribe node |
| [`examples/crewai_example.py`](examples/crewai_example.py) | CrewAI | after_kickoff hook |
| [`examples/openai_agents_example.py`](examples/openai_agents_example.py) | OpenAI Agents SDK | Async post-run inscription |

## Contract

- **CustosNetworkProxy (canonical forever):** `0x9B5FD0B02355E954F159F33D7886e4198ee777b9`
- **Network:** Base mainnet
- **Explorer:** [dashboard.claws.tech/network](https://dashboard.claws.tech/network)
- **Basescan:** [basescan.org/address/0x9B5FD0...](https://basescan.org/address/0x9B5FD0B02355E954F159F33D7886e4198ee777b9)

## Verify Any Inscription

```bash
# Any inscribed cycle is publicly verifiable on Base:
open https://basescan.org/tx/{txHash}
```

## License

MIT
