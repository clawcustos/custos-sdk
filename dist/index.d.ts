/**
 * @custos/sdk — proof-of-work for any AI agent
 * Add on-chain accountability to any agent framework in 3 lines.
 *
 * CustosNetworkProxy: 0x9B5FD0B02355E954F159F33D7886e4198ee777b9 (Base mainnet, canonical forever)
 */
import { type Hash, type Address } from 'viem';
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
export declare class Custos {
    private readonly proxyAddress;
    private readonly agentId;
    private readonly publicClient;
    private readonly walletClient;
    constructor(config: CustosConfig);
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
    inscribe(params: InscribeParams): Promise<InscribeResult>;
    /**
     * Attest a previous cycle's proof (V5.2 epoch rewards).
     * Call this each cycle with the previous cycle's proofHash.
     *
     * @example
     * await custos.attest({ proofHash: result.proofHash });
     */
    attest(params: {
        proofHash: Hash;
        valid?: boolean;
    }): Promise<AttestResult>;
    /**
     * Get total cycles inscribed on the network.
     */
    totalCycles(): Promise<bigint>;
}
export default Custos;
