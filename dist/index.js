"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/index.ts
var index_exports = {};
__export(index_exports, {
  Custos: () => Custos,
  default: () => index_default
});
module.exports = __toCommonJS(index_exports);
var import_viem = require("viem");
var import_chains = require("viem/chains");
var import_accounts = require("viem/accounts");
var PROXY_ABI = (0, import_viem.parseAbi)([
  // Core inscription — auto-registers on first call (no registerAgent needed)
  "function inscribe(bytes32 proofHash, bytes32 prevHash, string blockType, string summary) external",
  // Attestation (validators only, earns epoch points)
  "function attest(uint256 agentId, bytes32 proofHash, bool valid) external",
  // Read state
  "function totalCycles() external view returns (uint256)",
  "function totalAgents() external view returns (uint256)",
  "function agentIdByWallet(address wallet) external view returns (uint256)",
  "function getAgent(uint256 agentId) external view returns (uint256,address,string,uint8,uint256,bytes32,uint256,uint256,bool,uint256)",
  "function chainHead(uint256 agentId) external view returns (bytes32)",
  // Validator subscription (V5.3)
  "function subscribeValidator() external",
  "function renewSubscription() external",
  "function checkSubscription(address wallet) external view returns (bool)",
  "function validatorSubscriptionFee() external view returns (uint256)",
  // Epoch rewards
  "function currentEpoch() external view returns (uint256)",
  "function claim(uint256 epochId) external",
  "function epochClaimed(uint256 epochId, address validator) external view returns (bool)",
  "function validatorEpochPoints(uint256 epochId, address validator) external view returns (uint256)",
  "function epochSnapshotPool(uint256 epochId) external view returns (uint256)"
]);
var ERC20_ABI = (0, import_viem.parseAbi)([
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function allowance(address owner, address spender) external view returns (uint256)"
]);
var PROXY_ADDRESS = "0x9B5FD0B02355E954F159F33D7886e4198ee777b9";
var USDC_ADDRESS = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
var INSCRIPTION_FEE = 100000n;
var DEFAULT_RPC = "https://mainnet.base.org";
var Custos = class {
  constructor(config) {
    const pk = config.privateKey.startsWith("0x") ? config.privateKey : `0x${config.privateKey}`;
    this.account = (0, import_accounts.privateKeyToAccount)(pk);
    this.proxyAddress = config.proxyAddress ?? PROXY_ADDRESS;
    const rpc = config.rpcUrl ?? DEFAULT_RPC;
    this.pub = (0, import_viem.createPublicClient)({ chain: import_chains.base, transport: (0, import_viem.http)(rpc) });
    this.wall = (0, import_viem.createWalletClient)({ account: this.account, chain: import_chains.base, transport: (0, import_viem.http)(rpc) });
  }
  // ─── Inscribe ───────────────────────────────────────────────────────────────
  /**
   * Inscribe a proof-of-work cycle onchain.
   * Auto-registers your wallet as an agent on first call — no prior setup needed.
   * Automatically approves USDC if allowance insufficient.
   *
   * @example
   * const custos = new Custos({ privateKey: process.env.AGENT_KEY! });
   * const result = await custos.inscribe({
   *   block: 'build',
   *   summary: 'Shipped auth module, all tests passing',
   *   content: JSON.stringify({ commits: ['abc123'], linesAdded: 420 }),
   * });
   * console.log(result.txHash, result.proofHash);
   */
  async inscribe(params) {
    const { block, summary, content } = params;
    if (summary.length > 140) {
      throw new Error(`summary must be \u2264 140 chars (got ${summary.length})`);
    }
    const agentId = await this.pub.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "agentIdByWallet",
      args: [this.account.address]
    });
    let prevHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
    if (agentId > 0n) {
      const raw = await this.pub.readContract({
        address: this.proxyAddress,
        abi: PROXY_ABI,
        functionName: "getAgent",
        args: [agentId]
      });
      prevHash = raw[5];
    }
    const proofHash = (0, import_viem.keccak256)(
      (0, import_viem.encodePacked)(["string", "bytes32", "uint256"], [content, prevHash, BigInt(Date.now())])
    );
    await this._ensureUsdcAllowance(INSCRIPTION_FEE);
    const { request } = await this.pub.simulateContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "inscribe",
      args: [proofHash, prevHash, block, summary],
      account: this.account
    });
    const txHash = await this.wall.writeContract(request);
    await this.pub.waitForTransactionReceipt({ hash: txHash });
    const networkCycles = await this.totalCycles();
    return { txHash, proofHash, prevHash, networkCycles };
  }
  // ─── Attest ─────────────────────────────────────────────────────────────────
  /**
   * Attest another agent's proof hash. Validators only.
   * Earns epoch points — claim rewards after epoch closes.
   *
   * @example
   * await custos.attest({ agentId: 2n, proofHash: '0x...' });
   */
  async attest(params) {
    const { agentId, proofHash, valid = true } = params;
    const { request } = await this.pub.simulateContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "attest",
      args: [agentId, proofHash, valid],
      account: this.account
    });
    const txHash = await this.wall.writeContract(request);
    await this.pub.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }
  // ─── Validator subscription ──────────────────────────────────────────────────
  /**
   * Subscribe as a validator. Requires 144+ inscriptions.
   * Costs validatorSubscriptionFee USDC/month (default $10).
   */
  async subscribeValidator() {
    const fee = await this.pub.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "validatorSubscriptionFee"
    });
    await this._ensureUsdcAllowance(fee);
    const { request } = await this.pub.simulateContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "subscribeValidator",
      account: this.account
    });
    const txHash = await this.wall.writeContract(request);
    await this.pub.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }
  /**
   * Renew validator subscription before or after lapse.
   */
  async renewSubscription() {
    const fee = await this.pub.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "validatorSubscriptionFee"
    });
    await this._ensureUsdcAllowance(fee);
    const { request } = await this.pub.simulateContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "renewSubscription",
      account: this.account
    });
    const txHash = await this.wall.writeContract(request);
    await this.pub.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }
  /**
   * Check if a wallet has an active validator subscription.
   */
  async checkSubscription(wallet) {
    return this.pub.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "checkSubscription",
      args: [wallet ?? this.account.address]
    });
  }
  // ─── Epoch rewards ───────────────────────────────────────────────────────────
  /**
   * Claim epoch rewards for a closed epoch.
   */
  async claimEpoch(epochId) {
    const { request } = await this.pub.simulateContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "claim",
      args: [epochId],
      account: this.account
    });
    const txHash = await this.wall.writeContract(request);
    await this.pub.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }
  // ─── Read helpers ────────────────────────────────────────────────────────────
  /** Total cycles inscribed across all agents on the network. */
  async totalCycles() {
    return this.pub.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "totalCycles"
    });
  }
  /** Total agents registered on the network. */
  async totalAgents() {
    return this.pub.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "totalAgents"
    });
  }
  /** Get agent state for this wallet. Returns null if not yet registered. */
  async getMyAgent() {
    const agentId = await this.pub.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "agentIdByWallet",
      args: [this.account.address]
    });
    if (agentId === 0n) return null;
    return this._getAgent(agentId);
  }
  /** Current epoch number. */
  async currentEpoch() {
    return this.pub.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "currentEpoch"
    });
  }
  // ─── Internal helpers ─────────────────────────────────────────────────────────
  async _getAgent(agentId) {
    const raw = await this.pub.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "getAgent",
      args: [agentId]
    });
    return {
      agentId: raw[0],
      wallet: raw[1],
      name: raw[2],
      role: raw[3],
      cycleCount: raw[4],
      chainHead: raw[5],
      registeredAt: raw[6],
      lastInscriptionAt: raw[7],
      active: raw[8],
      subExpiresAt: raw[9]
    };
  }
  async _ensureUsdcAllowance(amount) {
    const allowance = await this.pub.readContract({
      address: USDC_ADDRESS,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [this.account.address, this.proxyAddress]
    });
    if (allowance < amount) {
      const { request } = await this.pub.simulateContract({
        address: USDC_ADDRESS,
        abi: ERC20_ABI,
        functionName: "approve",
        args: [this.proxyAddress, amount],
        account: this.account
      });
      const txHash = await this.wall.writeContract(request);
      await this.pub.waitForTransactionReceipt({ hash: txHash });
    }
  }
};
var index_default = Custos;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Custos
});
