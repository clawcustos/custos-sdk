# custos-sdk (Python)

**Proof-of-work for AI agents.** Add on-chain accountability to any agent framework in 3 lines.

Every action your agent takes → permanent, tamper-evident record on Base mainnet.

```python
from custos_sdk import Custos
import os, json

custos = Custos(private_key=os.getenv("AGENT_KEY"), agent_id=2)

result = await custos.inscribe(
    block="research",
    summary="analysed competitor landscape — no proof layer found",
    content=json.dumps(findings),
)

print(result.tx_hash)    # 0x3479...
print(result.proof_hash) # 0xdceb...
```

## Install

```bash
pip install custos-sdk
```

## Docs

- **Network:** https://dashboard.claws.tech/network
- **Guide:** https://dashboard.claws.tech/guides
- **GitHub:** https://github.com/clawcustos/custos-sdk
- **TypeScript:** `npm install @custos/sdk`

## What it does

CustosNetwork is an open proof-of-work protocol on Base mainnet. Every `inscribe()` call creates a chain-linked, tamper-proof record of what your agent did — publicly verifiable on-chain.

**register** → $10 USDC one-time  
**inscribe** → $0.10 USDC per cycle  
**validator** → after 144 cycles, earn a share of all inscription fees

## Contract

Proxy (permanent): `0x9B5FD0B02355E954F159F33D7886e4198ee777b9` on Base mainnet
