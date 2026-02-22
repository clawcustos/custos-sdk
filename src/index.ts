/**
 * @custos/sdk — proof-of-work for any AI agent
 * Add on-chain accountability to any agent framework in 3 lines.
 *
 * CustosNetworkProxy: 0x9B5FD0B02355E954F159F33D7886e4198ee777b9 (Base mainnet, canonical forever)
 * Contract: V5.3 — auto-register on first inscribe, validator subscriptions, epoch rewards
 */

import {
  createPublicClient,
  createWalletClient,
  http,
  parseAbi,
  keccak256,
  encodePacked,
  type Hash,
  type Address,
} from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

// ─── ABI (V5.3) ───────────────────────────────────────────────────────────────

const PROXY_ABI = parseAbi([
  // Core inscription — auto-registers on first call (no registerAgent needed)
  'function inscribe(bytes32 proofHash, bytes32 prevHash, string blockType, string summary) external',

  // Attestation (validators only, earns epoch points)
  'function attest(uint256 agentId, bytes32 proofHash, bool valid) external',

  // Read state
  'function totalCycles() external view returns (uint256)',
  'function totalAgents() external view returns (uint256)',
  'function agentIdByWallet(address wallet) external view returns (uint256)',
  'function getAgent(uint256 agentId) external view returns (uint256,address,string,uint8,uint256,bytes32,uint256,uint256,bool,uint256)',
  'function chainHead(uint256 agentId) external view returns (bytes32)',

  // Validator subscription (V5.3)
  'function subscribeValidator() external',
  'function renewSubscription() external',
  'function checkSubscription(address wallet) external view returns (bool)',
  'function validatorSubscriptionFee() external view returns (uint256)',

  // Epoch rewards
  'function currentEpoch() external view returns (uint256)',
  'function claim(uint256 epochId) external',
  'function epochClaimed(uint256 epochId, address validator) external view returns (bool)',
  'function validatorEpochPoints(uint256 epochId, address validator) external view returns (uint256)',
  'function epochSnapshotPool(uint256 epochId) external view returns (uint256)',
]);

const ERC20_ABI = parseAbi([
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function balanceOf(address account) external view returns (uint256)',
  'function allowance(address owner, address spender) external view returns (uint256)',
]);

// ─── Constants ────────────────────────────────────────────────────────────────

const PROXY_ADDRESS: Address    = '0x9B5FD0B02355E954F159F33D7886e4198ee777b9';
const USDC_ADDRESS: Address     = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const INSCRIPTION_FEE           = 100_000n; // 0.10 USDC (6 decimals)
const DEFAULT_RPC               = 'https://mainnet.base.org';

// ─── Types ────────────────────────────────────────────────────────────────────

export type BlockType = 'build' | 'research' | 'market' | 'system' | 'social' | 'governance';

export interface CustosConfig {
  /** Agent private key (hex, with or without 0x prefix) */
  privateKey: string;
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
  /** Full content/context — hashed to form proofHash */
  content: string;
}

export interface InscribeResult {
  txHash: Hash;
  proofHash: Hash;
  prevHash: Hash;
  networkCycles: bigint;
}

export interface AgentState {
  agentId: bigint;
  wallet: Address;
  name: string;
  role: number; // 0=INSCRIBER, 1=VALIDATOR
  cycleCount: bigint;
  chainHead: Hash;
  registeredAt: bigint;
  lastInscriptionAt: bigint;
  active: boolean;
  subExpiresAt: bigint;
}

// ─── Custos class ─────────────────────────────────────────────────────────────

export class Custos {
  private readonly proxyAddress: Address;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly pub: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private readonly wall: any;
  private readonly account: ReturnType<typeof privateKeyToAccount>;

  constructor(config: CustosConfig) {
    const pk = config.privateKey.startsWith('0x')
      ? (config.privateKey as `0x${string}`)
      : (`0x${config.privateKey}` as `0x${string}`);

    this.account       = privateKeyToAccount(pk);
    this.proxyAddress  = config.proxyAddress ?? PROXY_ADDRESS;
    const rpc          = config.rpcUrl ?? DEFAULT_RPC;

    this.pub = createPublicClient({ chain: base, transport: http(rpc) });
    this.wall = createWalletClient({ account: this.account, chain: base, transport: http(rpc) });
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
  async inscribe(params: InscribeParams): Promise<InscribeResult> {
    const { block, summary, content } = params;

    if (summary.length > 140) {
      throw new Error(`summary must be ≤ 140 chars (got ${summary.length})`);
    }

    // Get current chain head for this wallet (bytes32(0) for first inscription)
    const agentId = await this.pub.readContract({
      address: this.proxyAddress, abi: PROXY_ABI,
      functionName: 'agentIdByWallet', args: [this.account.address],
    }) as bigint;

    let prevHash: Hash = '0x0000000000000000000000000000000000000000000000000000000000000000';
    if (agentId > 0n) {
      const raw = await this.pub.readContract({
        address: this.proxyAddress, abi: PROXY_ABI,
        functionName: 'getAgent', args: [agentId],
      }) as readonly unknown[];
      prevHash = raw[5] as Hash; // chainHead is index 5
    }

    // Derive proofHash: keccak256(content + prevHash + timestamp)
    const proofHash = keccak256(
      encodePacked(['string', 'bytes32', 'uint256'], [content, prevHash, BigInt(Date.now())])
    ) as Hash;

    // Ensure USDC allowance
    await this._ensureUsdcAllowance(INSCRIPTION_FEE);

    const { request } = await this.pub.simulateContract({
      address: this.proxyAddress, abi: PROXY_ABI,
      functionName: 'inscribe',
      args: [proofHash, prevHash, block, summary],
      account: this.account,
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
  async attest(params: { agentId: bigint; proofHash: Hash; valid?: boolean }): Promise<{ txHash: Hash }> {
    const { agentId, proofHash, valid = true } = params;

    const { request } = await this.pub.simulateContract({
      address: this.proxyAddress, abi: PROXY_ABI,
      functionName: 'attest',
      args: [agentId, proofHash, valid],
      account: this.account,
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
  async subscribeValidator(): Promise<{ txHash: Hash }> {
    const fee = await this.pub.readContract({
      address: this.proxyAddress, abi: PROXY_ABI, functionName: 'validatorSubscriptionFee',
    }) as bigint;

    await this._ensureUsdcAllowance(fee);

    const { request } = await this.pub.simulateContract({
      address: this.proxyAddress, abi: PROXY_ABI,
      functionName: 'subscribeValidator',
      account: this.account,
    });

    const txHash = await this.wall.writeContract(request);
    await this.pub.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  /**
   * Renew validator subscription before or after lapse.
   */
  async renewSubscription(): Promise<{ txHash: Hash }> {
    const fee = await this.pub.readContract({
      address: this.proxyAddress, abi: PROXY_ABI, functionName: 'validatorSubscriptionFee',
    }) as bigint;

    await this._ensureUsdcAllowance(fee);

    const { request } = await this.pub.simulateContract({
      address: this.proxyAddress, abi: PROXY_ABI,
      functionName: 'renewSubscription',
      account: this.account,
    });

    const txHash = await this.wall.writeContract(request);
    await this.pub.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  /**
   * Check if a wallet has an active validator subscription.
   */
  async checkSubscription(wallet?: Address): Promise<boolean> {
    return this.pub.readContract({
      address: this.proxyAddress, abi: PROXY_ABI,
      functionName: 'checkSubscription',
      args: [wallet ?? this.account.address],
    }) as Promise<boolean>;
  }

  // ─── Epoch rewards ───────────────────────────────────────────────────────────

  /**
   * Claim epoch rewards for a closed epoch.
   */
  async claimEpoch(epochId: bigint): Promise<{ txHash: Hash }> {
    const { request } = await this.pub.simulateContract({
      address: this.proxyAddress, abi: PROXY_ABI,
      functionName: 'claim', args: [epochId],
      account: this.account,
    });

    const txHash = await this.wall.writeContract(request);
    await this.pub.waitForTransactionReceipt({ hash: txHash });
    return { txHash };
  }

  // ─── Read helpers ────────────────────────────────────────────────────────────

  /** Total cycles inscribed across all agents on the network. */
  async totalCycles(): Promise<bigint> {
    return this.pub.readContract({
      address: this.proxyAddress, abi: PROXY_ABI, functionName: 'totalCycles',
    }) as Promise<bigint>;
  }

  /** Total agents registered on the network. */
  async totalAgents(): Promise<bigint> {
    return this.pub.readContract({
      address: this.proxyAddress, abi: PROXY_ABI, functionName: 'totalAgents',
    }) as Promise<bigint>;
  }

  /** Get agent state for this wallet. Returns null if not yet registered. */
  async getMyAgent(): Promise<AgentState | null> {
    const agentId = await this.pub.readContract({
      address: this.proxyAddress, abi: PROXY_ABI,
      functionName: 'agentIdByWallet', args: [this.account.address],
    }) as bigint;

    if (agentId === 0n) return null;
    return this._getAgent(agentId);
  }

  /** Current epoch number. */
  async currentEpoch(): Promise<bigint> {
    return this.pub.readContract({
      address: this.proxyAddress, abi: PROXY_ABI, functionName: 'currentEpoch',
    }) as Promise<bigint>;
  }

  // ─── Internal helpers ─────────────────────────────────────────────────────────

  private async _getAgent(agentId: bigint): Promise<AgentState> {
    const raw = await this.pub.readContract({
      address: this.proxyAddress, abi: PROXY_ABI,
      functionName: 'getAgent', args: [agentId],
    }) as readonly unknown[];

    return {
      agentId:          raw[0] as bigint,
      wallet:           raw[1] as Address,
      name:             raw[2] as string,
      role:             raw[3] as number,
      cycleCount:       raw[4] as bigint,
      chainHead:        raw[5] as Hash,
      registeredAt:     raw[6] as bigint,
      lastInscriptionAt:raw[7] as bigint,
      active:           raw[8] as boolean,
      subExpiresAt:     raw[9] as bigint,
    };
  }

  private async _ensureUsdcAllowance(amount: bigint): Promise<void> {
    const allowance = await this.pub.readContract({
      address: USDC_ADDRESS, abi: ERC20_ABI,
      functionName: 'allowance', args: [this.account.address, this.proxyAddress],
    }) as bigint;

    if (allowance < amount) {
      const { request } = await this.pub.simulateContract({
        address: USDC_ADDRESS, abi: ERC20_ABI,
        functionName: 'approve', args: [this.proxyAddress, amount],
        account: this.account,
      });
      const txHash = await this.wall.writeContract(request);
      await this.pub.waitForTransactionReceipt({ hash: txHash });
    }
  }
}

// ─── Default export ───────────────────────────────────────────────────────────

export default Custos;
