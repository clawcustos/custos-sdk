# CustosNetwork + MCP + A2A Integration Guide

*Adding permanent proof-of-work to multi-agent stacks*

---

## The Problem

MCP and A2A define how AI agents access tools and coordinate with each other.  
Neither provides a permanent, tamper-evident record of what agents actually did.

| Layer | Protocol | What it does | Audit trail? |
|-------|----------|-------------|--------------|
| Tool access | MCP | Agents connect to data/tools | Runtime logs only |
| Coordination | A2A | Agents delegate to agents | Ephemeral traces |
| **Proof** | **CustosNetwork** | **Every action inscribed onchain** | **✅ Permanent, tamper-evident** |

When your regulator asks for proof 6 months later — MCP gateway logs have rotated, A2A traces have expired. CustosNetwork inscriptions on Base are permanent.

---

## MCP Gateway Integration

Add CustosNetwork as a middleware layer in your MCP gateway to inscribe every tool call.

### Python (FastMCP / custom gateway)

```python
import os
import json
from functools import wraps
from custos_sdk import Custos

custos = Custos(private_key=os.getenv("AGENT_KEY"), agent_id=1)

def with_proof(block: str = "build"):
    """Decorator: inscribe every MCP tool call onchain."""
    def decorator(fn):
        @wraps(fn)
        async def wrapper(*args, **kwargs):
            result = await fn(*args, **kwargs)

            # Inscribe proof of this tool invocation
            summary = f"{fn.__name__}: {str(result)[:100]}"
            content = json.dumps({
                "tool": fn.__name__,
                "args": str(args)[:200],
                "kwargs": str(kwargs)[:200],
                "result": str(result)[:500],
            })
            proof = await custos.inscribe(block=block, summary=summary, content=content)
            print(f"[custos] inscribed: {proof.tx_hash}")

            return result
        return wrapper
    return decorator


# Apply to any MCP tool
@with_proof(block="build")
async def run_code(code: str) -> str:
    # ... your tool implementation
    return output
```

### TypeScript (MCP SDK)

```ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { Custos } from '@custos/sdk';

const custos = new Custos({ privateKey: process.env.AGENT_KEY! });
const server = new McpServer({ name: 'my-agent', version: '1.0.0' });

// Wrap any tool with proof inscription
function withProof<T>(
  toolName: string,
  fn: (...args: unknown[]) => Promise<T>
): (...args: unknown[]) => Promise<T> {
  return async (...args) => {
    const result = await fn(...args);

    await custos.inscribe({
      block: 'build',
      summary: `${toolName}: ${JSON.stringify(result).slice(0, 100)}`,
      content: JSON.stringify({ tool: toolName, args, result }),
    });

    return result;
  };
}

// Register tool with proof
server.tool('run-analysis', { query: z.string() }, withProof('run-analysis', async ({ query }) => {
  // ... tool implementation
  return { result: '...' };
}));
```

---

## A2A Agent Integration

CustosNetwork integrates at the A2A task boundary — inscribe when a task is completed or delegated.

### Python (A2A task handler)

```python
import os
import json
from custos_sdk import Custos

custos = Custos(private_key=os.getenv("AGENT_KEY"), agent_id=1)


async def handle_task(task_input: dict) -> dict:
    """A2A task handler with proof inscription."""

    # Execute the task
    result = await execute_task(task_input)

    # Inscribe proof at task boundary
    summary = f"A2A task: {task_input.get('type', 'unknown')} — {str(result)[:80]}"
    content = json.dumps({
        "protocol": "A2A",
        "task": task_input,
        "result": result,
        "agent_id": os.getenv("AGENT_ID"),
    })

    proof = await custos.inscribe(block="build", summary=summary, content=content)

    # Return result + proof (pass proofHash downstream for verification)
    return {
        **result,
        "_custos": {
            "tx_hash": proof.tx_hash,
            "proof_hash": proof.proof_hash,
            "network_cycle": proof.network_cycle,
        }
    }


async def execute_task(task: dict) -> dict:
    # ... your A2A task logic
    return {"status": "completed", "output": "..."}
```

### Chain of Custody Pattern

For multi-hop A2A workflows (agent → sub-agent → sub-agent), pass `proofHash` through the chain:

```python
# Orchestrator agent
result_1 = await sub_agent_1.execute(task)
proof_1 = result_1["_custos"]["proof_hash"]

# Sub-agent attests the orchestrator's proof
await custos.attest(proof_hash=proof_1)

result_2 = await sub_agent_2.execute({**task, "prev_proof": proof_1})
proof_2 = result_2["_custos"]["proof_hash"]

# Each hop creates an immutable chain:
# orchestrator → sub-agent-1 → sub-agent-2
# Verifiable on Base: basescan.org/address/0x9B5FD0...
```

---

## Compliance Output

Every inscribed cycle produces:

```json
{
  "txHash": "0xf68a16a4...",
  "proofHash": "0x4a41a64f...",
  "networkCycle": 172,
  "timestamp": 1740190000,
  "chain": "base",
  "contract": "0x9B5FD0B02355E954F159F33D7886e4198ee777b9"
}
```

- **EU AI Act Art.12**: immutable audit log for high-risk AI actions ✅
- **OWASP Agentic AI Top 10 2026**: "immutable, signed audit logs" ✅  
- **ISO/IEC 42001**: AIMS monitoring evidence layer ✅
- **A2A Governance**: tamper-evident distributed audit trail ✅

Verify any inscription: `https://basescan.org/tx/{txHash}`

---

## Quick Reference

| Use case | Method | When to call |
|----------|--------|-------------|
| Log a tool call | `inscribe(block='build', ...)` | After each MCP tool invocation |
| Log a research step | `inscribe(block='research', ...)` | After agent reasoning cycle |
| Log task delegation | `inscribe(block='system', ...)` | At A2A task handoff |
| Attest peer's work | `attest(proof_hash=...)` | After receiving A2A result |

---

## Resources

- **Dashboard**: [dashboard.claws.tech/network](https://dashboard.claws.tech/network)
- **Contract**: `0x9B5FD0B02355E954F159F33D7886e4198ee777b9` (Base mainnet)
- **Basescan**: [basescan.org/address/0x9B5FD0...](https://basescan.org/address/0x9B5FD0B02355E954F159F33D7886e4198ee777b9)
- **npm**: `@custos/sdk` | **PyPI**: `custos-sdk`
