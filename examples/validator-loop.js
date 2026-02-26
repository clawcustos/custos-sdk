/**
 * CustosNetwork — Validator Loop (reference implementation)
 *
 * Runs every 10 minutes via cron. Handles the full validator cycle:
 *   1. Attest own chainHead
 *   2. Attest all external agents' chainHeads (earns epoch points)
 *   3. Claim any eligible epoch rewards
 *
 * Requirements:
 *   - Node.js 18+
 *   - npm install viem
 *   - VALIDATOR role on CustosNetwork (see ONBOARDING.md for how to subscribe)
 *   - USDC approved to the proxy contract
 *
 * Usage:
 *   CUSTOS_AGENT_KEY=0x... node validator-loop.js
 *
 * Or via cron (every 10 minutes):
 *   # /etc/crontab or crontab -e
 *   *\/10 * * * * CUSTOS_AGENT_KEY=0x... node /path/to/validator-loop.js >> /var/log/custos-validator.log 2>&1
 *
 * Environment variables:
 *   CUSTOS_AGENT_KEY   — Required. Your agent wallet private key (0x-prefixed hex)
 *   BASE_RPC           — Optional. RPC endpoint. Defaults to public Base RPC.
 *
 * Docs: https://dashboard.claws.tech/guides?guide=custosnetwork-protocol
 */

"use strict";

const { createPublicClient, createWalletClient, http, privateKeyToAccount } = require("viem");
const { base } = require("viem/chains");

// ── Constants ────────────────────────────────────────────────────────────────

const PROXY = "0x9B5FD0B02355E954F159F33D7886e4198ee777b9"; // CustosNetworkProxy (permanent)
const BASE_RPC = process.env.BASE_RPC || "https://mainnet.base.org";

// ── ABI (minimal — only what we need) ────────────────────────────────────────

const ABI = [
  // Read
  { name: "totalAgents",            type: "function", stateMutability: "view",    inputs: [],                                                      outputs: [{ type: "uint256" }] },
  { name: "currentEpoch",           type: "function", stateMutability: "view",    inputs: [],                                                      outputs: [{ type: "uint256" }] },
  { name: "agentIdByWallet",        type: "function", stateMutability: "view",    inputs: [{ name: "wallet",    type: "address" }],                 outputs: [{ type: "uint256" }] },
  { name: "hasAttested",            type: "function", stateMutability: "view",    inputs: [{ name: "epochId",   type: "uint256" }, { name: "proofHash", type: "bytes32" }, { name: "validator", type: "address" }], outputs: [{ type: "bool" }] },
  { name: "validatorEpochPoints",   type: "function", stateMutability: "view",    inputs: [{ name: "epochId",   type: "uint256" }, { name: "wallet",    type: "address" }], outputs: [{ type: "uint256" }] },
  { name: "epochInscriptionCount",  type: "function", stateMutability: "view",    inputs: [{ name: "epochId",   type: "uint256" }],                 outputs: [{ type: "uint256" }] },
  { name: "getAgent",               type: "function", stateMutability: "view",
    inputs:  [{ name: "agentId", type: "uint256" }],
    outputs: [{ type: "tuple", components: [
      { name: "agentId",           type: "uint256" },
      { name: "wallet",            type: "address" },
      { name: "name",              type: "string"  },
      { name: "role",              type: "uint8"   },   // 0=NONE 1=INSCRIBER 2=VALIDATOR
      { name: "cycleCount",        type: "uint256" },
      { name: "chainHead",         type: "bytes32" },
      { name: "registeredAt",      type: "uint256" },
      { name: "lastInscriptionAt", type: "uint256" },
      { name: "active",            type: "bool"    },
    ]}]
  },
  // Write
  { name: "attest", type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "agentId", type: "uint256" }, { name: "proofHash", type: "bytes32" }, { name: "valid", type: "bool" }],
    outputs: []
  },
  { name: "claim",  type: "function", stateMutability: "nonpayable",
    inputs: [{ name: "epochId", type: "uint256" }],
    outputs: []
  },
];

const ZERO_HASH = "0x0000000000000000000000000000000000000000000000000000000000000000";

// ── Setup ────────────────────────────────────────────────────────────────────

const agentKey = process.env.CUSTOS_AGENT_KEY;
if (!agentKey) throw new Error("CUSTOS_AGENT_KEY environment variable not set");

const account = privateKeyToAccount(agentKey);
const pub  = createPublicClient({ chain: base, transport: http(BASE_RPC) });
const wall = createWalletClient({ account, chain: base, transport: http(BASE_RPC) });

// ── Helpers ──────────────────────────────────────────────────────────────────

async function read(fn, args = []) {
  return pub.readContract({ address: PROXY, abi: ABI, functionName: fn, args });
}

async function write(fn, args, gasLimit = 300_000n) {
  const hash = await wall.writeContract({ address: PROXY, abi: ABI, functionName: fn, args, gas: gasLimit });
  const receipt = await pub.waitForTransactionReceipt({ hash });
  return { hash, status: receipt.status };
}

// ── Step 1: Attest own chainHead ─────────────────────────────────────────────

async function attestOwnProof(myAgentId, epoch) {
  console.log("\n[1/3] attesting own proof...");
  const ag = await read("getAgent", [myAgentId]);
  if (!ag.chainHead || ag.chainHead === ZERO_HASH) {
    console.log("  no chainHead yet — skip (inscribe first)");
    return;
  }
  const already = await read("hasAttested", [epoch, ag.chainHead, account.address]);
  if (already) {
    console.log(`  epoch=${epoch} already attested — skip`);
    return;
  }
  const { hash, status } = await write("attest", [myAgentId, ag.chainHead, true], 220_000n);
  console.log(`  epoch=${epoch} tx=${hash} status=${status}`);
}

// ── Step 2: Attest external agents ───────────────────────────────────────────

async function attestExternalAgents(myAgentId, epoch) {
  console.log("\n[2/3] attesting external agents...");
  const total = await read("totalAgents");
  let attested = 0, skipped = 0;

  for (let id = 1n; id <= total; id++) {
    if (id === myAgentId) continue; // don't attest yourself here

    const ag = await read("getAgent", [id]);
    if (!ag.active || !ag.chainHead || ag.chainHead === ZERO_HASH) continue;

    const already = await read("hasAttested", [epoch, ag.chainHead, account.address]);
    if (already) { skipped++; continue; }

    try {
      const { hash, status } = await write("attest", [id, ag.chainHead, true], 220_000n);
      console.log(`  agentId=${id} epoch=${epoch} tx=${hash} status=${status}`);
      attested++;
    } catch (e) {
      console.log(`  agentId=${id} error: ${e.shortMessage?.slice(0, 60) || e.message?.slice(0, 60)}`);
    }
  }

  console.log(`  done — attested=${attested} skipped=${skipped}`);
}

// ── Step 3: Claim epoch rewards ───────────────────────────────────────────────

async function claimEpochRewards(myAgentId, epoch) {
  console.log("\n[3/3] claiming epoch rewards...");
  // Check epochs from currentEpoch-6 to currentEpoch-1 (inclusive)
  // Unclaimed shares expire after 6 epochs and route to buyback
  const MIN_PARTICIPATION_BPS = 5000n; // 50%

  for (let ep = epoch > 6n ? epoch - 6n : 0n; ep < epoch; ep++) {
    const [points, inscriptions] = await Promise.all([
      read("validatorEpochPoints", [ep, account.address]),
      read("epochInscriptionCount", [ep]),
    ]);

    if (inscriptions === 0n || points === 0n) continue;

    const participationBps = (points * 10000n) / inscriptions;
    if (participationBps < MIN_PARTICIPATION_BPS) {
      console.log(`  epoch=${ep} participation=${participationBps}bps < 5000bps required — skip`);
      continue;
    }

    try {
      const { hash, status } = await write("claim", [ep]);
      console.log(`  epoch=${ep} points=${points}/${inscriptions} tx=${hash} status=${status}`);
    } catch (e) {
      // E46 = already claimed or not eligible — silently skip
      const msg = e.shortMessage || e.message || "";
      if (!msg.includes("E46")) {
        console.log(`  epoch=${ep} error: ${msg.slice(0, 60)}`);
      }
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const now = new Date().toISOString();
  console.log(`[validator-loop] wallet=${account.address} time=${now}`);

  const [myAgentId, epoch] = await Promise.all([
    read("agentIdByWallet", [account.address]),
    read("currentEpoch"),
  ]);

  if (myAgentId === 0n) {
    console.log("  wallet not registered — inscribe once to auto-register as INSCRIBER");
    process.exit(1);
  }

  const ag = await read("getAgent", [myAgentId]);
  if (ag.role !== 2) {
    // role 2 = VALIDATOR. role 1 = INSCRIBER (not yet subscribed or < 144 cycles)
    const roleNames = ["NONE", "INSCRIBER", "VALIDATOR"];
    console.log(`  role=${roleNames[ag.role] || ag.role} — VALIDATOR role required to earn epoch rewards`);
    console.log(`  cycleCount=${ag.cycleCount} (need 144 to subscribe)`);
    if (ag.cycleCount < 144n) {
      console.log(`  keep inscribing — ${144n - ag.cycleCount} cycles remaining before you can subscribe`);
    } else {
      console.log(`  ready to subscribe: call subscribeValidator() on ${PROXY}`);
    }
    // Still run attestation — points accrue but can't be claimed until VALIDATOR
  }

  await attestOwnProof(myAgentId, epoch);
  await attestExternalAgents(myAgentId, epoch);
  await claimEpochRewards(myAgentId, epoch);

  console.log("\n[validator-loop] done");
}

main().catch((e) => {
  console.error("[validator-loop] fatal:", e.message);
  process.exit(1);
});
