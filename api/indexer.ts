import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import { tradeQueries, leaderboardQueries, agentQueries } from './db';

// Helius RPC endpoint
const HELIUS_API_KEY = process.env.HELIUS_API_KEY || '';
const HELIUS_RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;
const connection = new Connection(HELIUS_RPC);

// Known DEX program IDs
const DEX_PROGRAMS = {
  JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  JUPITER_V4: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  RAYDIUM_V4: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_CLMM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  ORCA: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
};

// Token metadata cache
const tokenCache = new Map<string, { symbol: string; decimals: number }>();

// Get token info (symbol, decimals)
async function getTokenInfo(mint: string): Promise<{ symbol: string; decimals: number }> {
  if (tokenCache.has(mint)) {
    return tokenCache.get(mint)!;
  }

  try {
    // Use Helius DAS API for token metadata
    const response = await fetch(`https://api.helius.xyz/v0/token-metadata?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mintAccounts: [mint] }),
    });
    
    const data = await response.json();
    if (data?.[0]?.onChainMetadata?.metadata?.data) {
      const info = {
        symbol: data[0].onChainMetadata.metadata.data.symbol || 'UNKNOWN',
        decimals: data[0].onChainMetadata.metadata.decimals || 9,
      };
      tokenCache.set(mint, info);
      return info;
    }
  } catch (err) {
    console.error('Failed to get token info:', err);
  }

  const fallback = { symbol: 'UNKNOWN', decimals: 9 };
  tokenCache.set(mint, fallback);
  return fallback;
}

// Parse a transaction to extract trade info
export async function parseTransaction(
  tx: ParsedTransactionWithMeta,
  walletAddress: string
): Promise<{
  action: 'buy' | 'sell' | 'swap';
  tokenMint: string;
  tokenSymbol: string;
  amountSol: number;
  amountTokens: number;
  dex: string;
} | null> {
  if (!tx.meta || tx.meta.err) return null;

  const preBalances = tx.meta.preTokenBalances || [];
  const postBalances = tx.meta.postTokenBalances || [];

  // Find token balance changes for our wallet
  const walletPubkey = walletAddress;
  
  let solChange = 0;
  let tokenChange = 0;
  let tokenMint = '';

  // Calculate SOL change
  const accountKeys = tx.transaction.message.accountKeys;
  const walletIndex = accountKeys.findIndex(k => k.pubkey.toString() === walletPubkey);
  if (walletIndex >= 0 && tx.meta.preBalances && tx.meta.postBalances) {
    solChange = (tx.meta.postBalances[walletIndex] - tx.meta.preBalances[walletIndex]) / 1e9;
  }

  // Find token changes
  for (const post of postBalances) {
    if (post.owner === walletPubkey) {
      const pre = preBalances.find(p => p.mint === post.mint && p.owner === walletPubkey);
      const preAmount = pre?.uiTokenAmount?.uiAmount || 0;
      const postAmount = post.uiTokenAmount?.uiAmount || 0;
      const change = postAmount - preAmount;
      
      if (Math.abs(change) > tokenChange) {
        tokenChange = change;
        tokenMint = post.mint;
      }
    }
  }

  // Check for new token (not in pre)
  for (const post of postBalances) {
    if (post.owner === walletPubkey) {
      const inPre = preBalances.some(p => p.mint === post.mint && p.owner === walletPubkey);
      if (!inPre && post.uiTokenAmount?.uiAmount) {
        tokenChange = post.uiTokenAmount.uiAmount;
        tokenMint = post.mint;
        break;
      }
    }
  }

  if (!tokenMint || Math.abs(tokenChange) < 0.0001) return null;

  // Determine DEX used
  let dex = 'unknown';
  const programIds = tx.transaction.message.accountKeys.map(k => k.pubkey.toString());
  for (const [name, id] of Object.entries(DEX_PROGRAMS)) {
    if (programIds.includes(id)) {
      dex = name.toLowerCase().replace('_', '-');
      break;
    }
  }

  // Determine action
  const action: 'buy' | 'sell' | 'swap' = 
    solChange < -0.001 && tokenChange > 0 ? 'buy' :
    solChange > 0.001 && tokenChange < 0 ? 'sell' : 'swap';

  const tokenInfo = await getTokenInfo(tokenMint);

  return {
    action,
    tokenMint,
    tokenSymbol: tokenInfo.symbol,
    amountSol: Math.abs(solChange),
    amountTokens: Math.abs(tokenChange),
    dex,
  };
}

// Index historical transactions for a wallet
export async function indexWallet(walletAddress: string, agentId: number) {
  if (!HELIUS_API_KEY) {
    console.warn('No Helius API key - skipping wallet indexing');
    return;
  }

  console.log(`Indexing wallet ${walletAddress} for agent ${agentId}...`);

  try {
    const pubkey = new PublicKey(walletAddress);
    
    // Get recent signatures (last 100)
    const signatures = await connection.getSignaturesForAddress(pubkey, { limit: 100 });
    console.log(`Found ${signatures.length} transactions`);

    let indexed = 0;
    for (const sig of signatures) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });
        
        if (!tx) continue;

        const parsed = await parseTransaction(tx, walletAddress);
        if (!parsed) continue;

        // Insert trade
        tradeQueries.insert.run({
          agent_id: agentId,
          tx_signature: sig.signature,
          timestamp: new Date(sig.blockTime! * 1000).toISOString(),
          action: parsed.action,
          token_mint: parsed.tokenMint,
          token_symbol: parsed.tokenSymbol,
          amount_sol: parsed.amountSol,
          amount_tokens: parsed.amountTokens,
          price_usd: null, // TODO: Get from price API
          dex: parsed.dex,
          pnl_usd: null, // TODO: Calculate
        });

        indexed++;
      } catch (err) {
        // Skip failed tx parsing
      }
    }

    console.log(`Indexed ${indexed} trades for ${walletAddress}`);

    // Update leaderboard
    await updateLeaderboard(agentId);

  } catch (err) {
    console.error(`Failed to index wallet ${walletAddress}:`, err);
  }
}

// Update leaderboard stats for an agent
export async function updateLeaderboard(agentId: number) {
  // Get all trades for this agent
  const trades = tradeQueries.getByAgent.all(agentId, 10000) as any[];
  
  if (trades.length === 0) {
    return;
  }

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // Calculate stats
  let pnl24h = 0, pnl7d = 0, pnlAll = 0;
  let wins = 0, losses = 0;

  for (const trade of trades) {
    const tradeTime = new Date(trade.timestamp).getTime();
    const pnl = trade.pnl_usd || 0;

    pnlAll += pnl;
    if (now - tradeTime < day) pnl24h += pnl;
    if (now - tradeTime < 7 * day) pnl7d += pnl;

    if (pnl > 0) wins++;
    else if (pnl < 0) losses++;
  }

  const winRate = wins + losses > 0 ? (wins / (wins + losses)) * 100 : 0;

  leaderboardQueries.upsert.run({
    agent_id: agentId,
    pnl_24h: pnl24h,
    pnl_7d: pnl7d,
    pnl_all_time: pnlAll,
    win_rate: winRate,
    total_trades: trades.length,
  });

  console.log(`Updated leaderboard for agent ${agentId}: ${trades.length} trades, ${winRate.toFixed(1)}% win rate`);
}

// Set up Helius webhook for real-time tracking
export async function setupWebhook(webhookUrl: string, walletAddresses: string[]) {
  if (!HELIUS_API_KEY) {
    console.warn('No Helius API key - cannot setup webhook');
    return;
  }

  try {
    const response = await fetch(`https://api.helius.xyz/v0/webhooks?api-key=${HELIUS_API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        webhookURL: webhookUrl,
        transactionTypes: ['SWAP', 'TRANSFER'],
        accountAddresses: walletAddresses,
        webhookType: 'enhanced',
      }),
    });

    const data = await response.json();
    console.log('Webhook created:', data);
    return data;
  } catch (err) {
    console.error('Failed to create webhook:', err);
  }
}

// Cron job to update all leaderboards
export async function updateAllLeaderboards() {
  const agents = agentQueries.getVerified.all() as any[];
  console.log(`Updating leaderboards for ${agents.length} agents...`);

  for (const agent of agents) {
    await updateLeaderboard(agent.id);
  }
}
