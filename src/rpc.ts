import { Connection, PublicKey, ParsedTransactionWithMeta } from '@solana/web3.js';
import fs from 'fs';
import path from 'path';

// Use Helius RPC (we have API key) - fallback to public
const HELIUS_KEY = process.env.HELIUS_API_KEY || '5629f272-cbdf-475b-ac6c-1c73fccae3f4';
const RPC_URL = process.env.RPC_URL || `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
export const connection = new Connection(RPC_URL);

// DEX Program IDs
const DEX_PROGRAMS = {
  JUPITER_V6: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  JUPITER_V4: 'JUP4Fb2cqiRUcaTHdrPC8h2gNsA2ETXiPDD33WcGuJB',
  RAYDIUM_AMM: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
  RAYDIUM_CLMM: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
  PUMP_FUN: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P',
  ORCA: 'whirLbMiicVdio4qvUfM5KAg6Ct8VwpYzGff3uctyCc',
};

export interface Trade {
  signature: string;
  timestamp: number;
  tokenIn: string;
  tokenInMint: string;
  tokenOut: string;
  tokenOutMint: string;
  amountIn: number;
  amountOut: number;
  dex: string;
  wallet: string;
}

// Parse a swap transaction
export function parseSwap(tx: ParsedTransactionWithMeta, walletAddress: string): Trade | null {
  if (!tx.meta || tx.meta.err) return null;
  
  const preBalances = tx.meta.preTokenBalances || [];
  const postBalances = tx.meta.postTokenBalances || [];
  
  // Find which DEX was used
  const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toString());
  let dex = 'unknown';
  for (const [name, programId] of Object.entries(DEX_PROGRAMS)) {
    if (accountKeys.includes(programId)) {
      dex = name.toLowerCase().replace('_', '-');
      break;
    }
  }
  
  if (dex === 'unknown') return null; // Not a swap
  
  // Track balance changes for wallet
  const changes: { mint: string; change: number; symbol?: string }[] = [];
  
  for (const post of postBalances) {
    if (post.owner === walletAddress) {
      const pre = preBalances.find(p => p.mint === post.mint && p.owner === walletAddress);
      const preAmount = pre?.uiTokenAmount?.uiAmount || 0;
      const postAmount = post.uiTokenAmount?.uiAmount || 0;
      const change = postAmount - preAmount;
      
      if (Math.abs(change) > 0.000001) {
        changes.push({ mint: post.mint, change });
      }
    }
  }
  
  // Also check for tokens that were fully sold (in pre but not in post)
  for (const pre of preBalances) {
    if (pre.owner === walletAddress) {
      const inPost = postBalances.some(p => p.mint === pre.mint && p.owner === walletAddress);
      if (!inPost && pre.uiTokenAmount?.uiAmount) {
        changes.push({ mint: pre.mint, change: -pre.uiTokenAmount.uiAmount });
      }
    }
  }
  
  // Calculate SOL change
  const walletIndex = tx.transaction.message.accountKeys.findIndex(
    k => k.pubkey.toString() === walletAddress
  );
  let solChange = 0;
  if (walletIndex >= 0 && tx.meta.preBalances && tx.meta.postBalances) {
    solChange = (tx.meta.postBalances[walletIndex] - tx.meta.preBalances[walletIndex]) / 1e9;
  }
  
  // Determine tokenIn and tokenOut
  let tokenIn = { mint: 'SOL', amount: 0, symbol: 'SOL' };
  let tokenOut = { mint: 'SOL', amount: 0, symbol: 'SOL' };
  
  // SOL was spent
  if (solChange < -0.001) {
    tokenIn = { mint: 'So11111111111111111111111111111111111111112', amount: Math.abs(solChange), symbol: 'SOL' };
    // Find what was received
    const received = changes.find(c => c.change > 0);
    if (received) {
      tokenOut = { mint: received.mint, amount: received.change, symbol: received.mint.slice(0, 6) };
    }
  }
  // SOL was received
  else if (solChange > 0.001) {
    tokenOut = { mint: 'So11111111111111111111111111111111111111112', amount: solChange, symbol: 'SOL' };
    // Find what was spent
    const spent = changes.find(c => c.change < 0);
    if (spent) {
      tokenIn = { mint: spent.mint, amount: Math.abs(spent.change), symbol: spent.mint.slice(0, 6) };
    }
  }
  // Token to token swap
  else {
    const spent = changes.find(c => c.change < 0);
    const received = changes.find(c => c.change > 0);
    if (spent && received) {
      tokenIn = { mint: spent.mint, amount: Math.abs(spent.change), symbol: spent.mint.slice(0, 6) };
      tokenOut = { mint: received.mint, amount: received.change, symbol: received.mint.slice(0, 6) };
    }
  }
  
  if (tokenIn.amount === 0 || tokenOut.amount === 0) return null;
  
  return {
    signature: tx.transaction.signatures[0],
    timestamp: tx.blockTime || 0,
    tokenIn: tokenIn.symbol,
    tokenInMint: tokenIn.mint,
    tokenOut: tokenOut.symbol,
    tokenOutMint: tokenOut.mint,
    amountIn: tokenIn.amount,
    amountOut: tokenOut.amount,
    dex,
    wallet: walletAddress,
  };
}

// Fetch trades for a wallet
export async function getAgentTrades(walletAddress: string, limit = 100): Promise<Trade[]> {
  console.log(`Fetching trades for ${walletAddress}...`);
  
  const pubkey = new PublicKey(walletAddress);
  
  // Get recent signatures
  const signatures = await connection.getSignaturesForAddress(pubkey, { limit });
  console.log(`Found ${signatures.length} transactions`);
  
  const trades: Trade[] = [];
  
  // Fetch one at a time to avoid rate limits
  for (let i = 0; i < signatures.length; i++) {
    const sig = signatures[i];
    
    try {
      const tx = await connection.getParsedTransaction(sig.signature, {
        maxSupportedTransactionVersion: 0,
      });
      
      if (tx) {
        const trade = parseSwap(tx, walletAddress);
        if (trade) {
          trades.push(trade);
          console.log(`  Trade ${i + 1}: ${trade.tokenIn} → ${trade.tokenOut} (${trade.dex})`);
        }
      }
      
      // Delay between requests
      await new Promise(r => setTimeout(r, 200));
    } catch (err: any) {
      console.error(`Error fetching tx ${i}:`, err.message);
      // Longer wait on rate limit
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  
  console.log(`Parsed ${trades.length} trades`);
  return trades;
}

// Cache trades to file
export function cacheTrades(walletAddress: string, trades: Trade[]) {
  const cacheDir = path.join(__dirname, '..', 'cache', 'agents');
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  
  const filePath = path.join(cacheDir, `${walletAddress}.json`);
  fs.writeFileSync(filePath, JSON.stringify(trades, null, 2));
  console.log(`Cached ${trades.length} trades to ${filePath}`);
}

// Load cached trades
export function loadCachedTrades(walletAddress: string): Trade[] {
  const filePath = path.join(__dirname, '..', 'cache', 'agents', `${walletAddress}.json`);
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return [];
}

// Test with a wallet
if (require.main === module) {
  const testWallet = process.argv[2] || 'EARNsm7JPDHeYmmKkEYrzBVYkXot3tdiQW2Q2zWsiTZQ';
  getAgentTrades(testWallet, 20).then(trades => {
    console.log('\n=== TRADES ===');
    console.log(JSON.stringify(trades, null, 2));
    cacheTrades(testWallet, trades);
  });
}
