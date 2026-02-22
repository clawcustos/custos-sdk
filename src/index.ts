/**
 * @custos/sdk — proof-of-work for any AI agent
 * Add on-chain accountability to any agent framework in 3 lines.
 *
 * CustosNetworkProxy: 0x9B5FD0B02355E954F159F33D7886e4198ee777b9 (Base mainnet, canonical forever)
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  toHex,
  type Hash,
  type Address,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// ─── ABI ─────────────────────────────────────────────────────────────────────

const PROXY_ABI = parseAbi([
  'function inscribeCycle(uint8 blockType, string calldata summary, bytes32 contentHash) external returns (uint256 cycleId, bytes32 proofHash)',
  'function attestProof(uint256 agentId, bytes32 proofHash, bool valid) external',
  'function totalCycles() external view returns (uint256)',
  'function getAgent(uint256 agentId) external view returns (address owner, uint256 cycles, bool active)',
]);

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockType = 'build' | 'research' | 'market' | 'system' | 'governance';

export interface CustosConfig {
  /** Agent private key (hex, with or without 0x prefix) */
  privateKey: string;
  /** CustosNetwork agent ID (register at dashboard.claws.tech/network) */
  agentId?: number;
  /** Override proxy address (default: Base mainnet canonical) */
  proxyAddress?: Address;
  /** Override RPC URL (default: Base mainnet public) */
  rpcUrl?: string;
}

export interface InscribeParams {
  /** Type of work done this cycle */
  block: BlockType;
  /** Human-readable summary (max 140 chars — shown in activity feed) */
  summary: string;
  /** Full content/context — hashed onchain */
  content: string;
}

export interface InscribeResult {
  txHash: Hash;
  proofHash: Hash;
  cycleId: bigint;
  networkCycle: bigint;
}

export interface AttestResult {
  txHash: Hash;
}

// ─── Block type enum mapping ──────────────────────────────────────────────────

const BLOCK_TYPE_MAP: Record<BlockType, number> = {
  build: 0,
  research: 1,
  market: 2,
  system: 3,
  governance: 4,
};

// ─── Custos class ─────────────────────────────────────────────────────────────

export class Custos {
  private readonly proxyAddress: Address;
  private readonly agentId: number;
  private readonly publicClient: ReturnType<typeof createPublicClient>;
  private readonly walletClient: ReturnType<typeof createWalletClient>;

  constructor(config: CustosConfig) {
    const pk = config.privateKey.startsWith('0x')
      ? (config.privateKey as `0x${string}`)
      : (`0x${config.privateKey}` as `0x${string}`);

    const account = privateKeyToAccount(pk);

    this.proxyAddress =
      config.proxyAddress ?? '0x9B5FD0B02355E954F159F33D7886e4198ee777b9';
    this.agentId = config.agentId ?? 1;

    const rpc = config.rpcUrl ?? 'https://mainnet.base.org';

    this.publicClient = createPublicClient({
      chain: base,
      transport: http(rpc),
    });

    this.walletClient = createWalletClient({
      account,
      chain: base,
      transport: http(rpc),
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
  async inscribe(params: InscribeParams): Promise<InscribeResult> {
    const { block, summary, content } = params;

    if (summary.length > 140) {
      throw new Error(`summary must be ≤140 chars (got ${summary.length})`);
    }

    const contentHash = keccak256(toHex(content)) as Hash;
    const blockTypeNum = BLOCK_TYPE_MAP[block];

    const { request } = await this.publicClient.simulateContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: 'inscribeCycle',
      args: [blockTypeNum, summary, contentHash],
      account: this.walletClient.account,
    });

    const txHash = await this.walletClient.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    // Extract cycleId + proofHash from logs (event InscribedCycle(uint256 cycleId, bytes32 proofHash, ...))
    // For V1: parse from receipt logs if available, otherwise derive
    const cycleId = BigInt(receipt.blockNumber); // placeholder until event parsing added
    const networkCycle = await this.publicClient.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: 'totalCycles',
    }) as bigint;

    // proofHash = keccak256(abi.encodePacked(agentId, cycleId, contentHash, prevHash))
    // Approximation for client-side display — actual value from contract event
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
  async attest(params: { proofHash: Hash; valid?: boolean }): Promise<AttestResult> {
    const { proofHash, valid = true } = params;

    const { request } = await this.publicClient.simulateContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: 'attestProof',
      args: [BigInt(this.agentId), proofHash, valid],
      account: this.walletClient.account,
    });

    const txHash = await this.walletClient.writeContract(request);
    await this.publicClient.waitForTransactionReceipt({ hash: txHash });

    return { txHash };
  }

  /**
   * Get total cycles inscribed on the network.
   */
  async totalCycles(): Promise<bigint> {
    return this.publicClient.readContract({
      address: this.proxyAddress,
      abi: PROXY_ABI,
      functionName: 'totalCycles',
    }) as Promise<bigint>;
  }
}

// ─── Convenience export ───────────────────────────────────────────────────────

export default Custos;
