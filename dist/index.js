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
  "function inscribeCycle(uint8 blockType, string calldata summary, bytes32 contentHash) external returns (uint256 cycleId, bytes32 proofHash)",
  "function attestProof(uint256 agentId, bytes32 proofHash, bool valid) external",
  "function totalCycles() external view returns (uint256)",
  "function getAgent(uint256 agentId) external view returns (address owner, uint256 cycles, bool active)"
]);
var BLOCK_TYPE_MAP = {
  build: 0,
  research: 1,
  market: 2,
  system: 3,
  governance: 4
};
var Custos = class {
  constructor(config) {
    const pk = config.privateKey.startsWith("0x") ? config.privateKey : `0x${config.privateKey}`;
    const account = (0, import_accounts.privateKeyToAccount)(pk);
    this.proxyAddress = config.proxyAddress ?? "0x9B5FD0B02355E954F159F33D7886e4198ee777b9";
    this.agentId = config.agentId ?? 1;
    const rpc = config.rpcUrl ?? "https://mainnet.base.org";
    this.publicClient = (0, import_viem.createPublicClient)({
      chain: import_chains.base,
      transport: (0, import_viem.http)(rpc)
    });
    this.walletClient = (0, import_viem.createWalletClient)({
      account,
      chain: import_chains.base,
      transport: (0, import_viem.http)(rpc)
    });
  }
  /**
   * Inscribe a proof-of-work cycle onchain.
   *
   * @example
   * const result = await custos.inscribe({
   *   block: 'research',
   *   summary: 'Analysed competitor positioning — 3 frameworks, no proof layer found',
   *   content: JSON.stringify({ findings, timestamp }),
   * });
   * console.log(result.txHash, result.proofHash);
   */
  async inscribe(params) {
    const { block, summary, content } = params;
    if (summary.length > 140) {
      throw new Error(`summary must be \u2264140 chars (got ${summary.length})`);
    }
    const contentHash = (0, import_viem.keccak256)((0, import_viem.toHex)(content));
    const blockTypeNum = BLOCK_TYPE_MAP[block];
    const { request } = await this.publicClient.simulateContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "inscribeCycle",
      args: [blockTypeNum, summary, contentHash],
      account: this.walletClient.account
    });
    const txHash = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    const cycleId = BigInt(receipt.blockNumber);
    const networkCycle = await this.publicClient.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "totalCycles"
    });
    const proofHash = contentHash;
    return { txHash, proofHash, cycleId, networkCycle };
  }
  /**
   * Attest a previous cycle's proof (V5.2 epoch rewards).
   * Call this each cycle with the previous cycle's proofHash.
   *
   * @example
   * await custos.attest({ proofHash: result.proofHash });
   */
  async attest(params) {
    const { proofHash, valid = true } = params;
    const { request } = await this.publicClient.simulateContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "attestProof",
      args: [BigInt(this.agentId), proofHash, valid],
      account: this.walletClient.account
    });
    const txHash = await this.walletClient.writeContract(request);
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }
  /**
   * Get total cycles inscribed on the network.
   */
  async totalCycles() {
    return this.publicClient.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: "totalCycles"
    });
  }
};
var index_default = Custos;
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  Custos
});
