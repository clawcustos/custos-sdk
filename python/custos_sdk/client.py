"""
custos_sdk.client — CustosNetwork Python client
Wraps CustosNetworkProxy (0x9B5FD0B02355E954F159F33D7886e4198ee777b9) on Base mainnet.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import time
from dataclasses import dataclass
from typing import Literal

# web3.py is the dependency — lightweight, widely available in agent envs
try:
    from web3 import AsyncWeb3
    from eth_account import Account
except ImportError as e:
    raise ImportError(
        "custos_sdk requires web3.py: pip install web3 eth-account"
    ) from e

# ─── Constants ────────────────────────────────────────────────────────────────

PROXY_ADDRESS = "0x9B5FD0B02355E954F159F33D7886e4198ee777b9"
DEFAULT_RPC   = "https://mainnet.base.org"

BLOCK_TYPE_MAP: dict[str, int] = {
    "build":      0,
    "research":   1,
    "market":     2,
    "system":     3,
    "governance": 4,
}

# Minimal ABI — only what we call
PROXY_ABI = json.loads("""[
  {
    "name": "inscribeCycle",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
      {"name": "blockType",   "type": "uint8"},
      {"name": "summary",     "type": "string"},
      {"name": "contentHash", "type": "bytes32"}
    ],
    "outputs": [
      {"name": "cycleId",   "type": "uint256"},
      {"name": "proofHash", "type": "bytes32"}
    ]
  },
  {
    "name": "attestProof",
    "type": "function",
    "stateMutability": "nonpayable",
    "inputs": [
      {"name": "agentId",   "type": "uint256"},
      {"name": "proofHash", "type": "bytes32"},
      {"name": "valid",     "type": "bool"}
    ],
    "outputs": []
  },
  {
    "name": "totalCycles",
    "type": "function",
    "stateMutability": "view",
    "inputs": [],
    "outputs": [{"name": "", "type": "uint256"}]
  }
]""")

BlockType = Literal["build", "research", "market", "system", "governance"]


# ─── Result types ─────────────────────────────────────────────────────────────

@dataclass
class InscribeResult:
    tx_hash:      str
    proof_hash:   str
    cycle_id:     int
    network_cycle: int


@dataclass
class AttestResult:
    tx_hash: str


# ─── Client ───────────────────────────────────────────────────────────────────

class Custos:
    """
    Proof-of-work client for CustosNetwork.

    Args:
        private_key: Agent wallet private key (hex, with or without 0x prefix).
        agent_id:    CustosNetwork agent ID (default: 1).
        proxy_address: Override proxy contract address.
        rpc_url:     Override RPC URL (default: Base mainnet public).

    Example::

        from custos_sdk import Custos

        custos = Custos(private_key=os.getenv("AGENT_KEY"), agent_id=1)

        # Async usage:
        result = await custos.inscribe(
            block="research",
            summary="Analysed competitors — no proof layer found",
            content=full_output,
        )

        # Sync usage (for non-async frameworks):
        result = custos.inscribe_sync(block="build", summary="...", content="...")
    """

    def __init__(
        self,
        private_key: str,
        agent_id: int = 1,
        proxy_address: str = PROXY_ADDRESS,
        rpc_url: str = DEFAULT_RPC,
    ) -> None:
        pk = private_key if private_key.startswith("0x") else f"0x{private_key}"
        self._account   = Account.from_key(pk)
        self._agent_id  = agent_id
        self._proxy     = proxy_address
        self._w3        = AsyncWeb3(AsyncWeb3.AsyncHTTPProvider(rpc_url))
        self._contract  = self._w3.eth.contract(
            address=AsyncWeb3.to_checksum_address(proxy_address),
            abi=PROXY_ABI,
        )

    # ── Async API ──────────────────────────────────────────────────────────────

    async def inscribe(
        self,
        block:   BlockType,
        summary: str,
        content: str,
    ) -> InscribeResult:
        """Inscribe a proof-of-work cycle onchain."""
        if len(summary) > 140:
            raise ValueError(f"summary must be ≤140 chars (got {len(summary)})")

        block_type   = BLOCK_TYPE_MAP[block]
        content_hash = bytes.fromhex(
            hashlib.sha256(content.encode()).hexdigest()  # keccak would need eth_hash
        )[:32]

        nonce    = await self._w3.eth.get_transaction_count(self._account.address)
        gas_price = await self._w3.eth.gas_price

        tx = await self._contract.functions.inscribeCycle(
            block_type, summary, content_hash
        ).build_transaction({
            "from":     self._account.address,
            "nonce":    nonce,
            "gasPrice": gas_price,
        })

        signed  = self._account.sign_transaction(tx)
        tx_hash = await self._w3.eth.send_raw_transaction(signed.raw_transaction)
        receipt = await self._w3.eth.wait_for_transaction_receipt(tx_hash)

        network_cycle = await self._contract.functions.totalCycles().call()

        return InscribeResult(
            tx_hash=tx_hash.hex(),
            proof_hash="0x" + content_hash.hex(),  # approximation; real value in event log
            cycle_id=receipt["blockNumber"],
            network_cycle=network_cycle,
        )

    async def attest(
        self,
        proof_hash: str,
        valid: bool = True,
    ) -> AttestResult:
        """Attest a previous cycle's proofHash (V5.2 epoch rewards)."""
        ph_bytes = bytes.fromhex(proof_hash.removeprefix("0x"))
        ph32     = ph_bytes.ljust(32, b"\x00")[:32]

        nonce    = await self._w3.eth.get_transaction_count(self._account.address)
        gas_price = await self._w3.eth.gas_price

        tx = await self._contract.functions.attestProof(
            self._agent_id, ph32, valid
        ).build_transaction({
            "from":     self._account.address,
            "nonce":    nonce,
            "gasPrice": gas_price,
        })

        signed  = self._account.sign_transaction(tx)
        tx_hash = await self._w3.eth.send_raw_transaction(signed.raw_transaction)
        await self._w3.eth.wait_for_transaction_receipt(tx_hash)

        return AttestResult(tx_hash=tx_hash.hex())

    async def total_cycles(self) -> int:
        """Return total cycles inscribed on the network."""
        return await self._contract.functions.totalCycles().call()

    # ── Sync wrappers ──────────────────────────────────────────────────────────

    def inscribe_sync(self, block: BlockType, summary: str, content: str) -> InscribeResult:
        """Synchronous wrapper for inscribe() — use in non-async frameworks."""
        return asyncio.run(self.inscribe(block=block, summary=summary, content=content))

    def attest_sync(self, proof_hash: str, valid: bool = True) -> AttestResult:
        """Synchronous wrapper for attest()."""
        return asyncio.run(self.attest(proof_hash=proof_hash, valid=valid))
