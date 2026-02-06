import fs from 'fs';
import path from 'path';
import { getAgentTrades, cacheTrades, loadCachedTrades, Trade } from './rpc';

const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_DIR = path.join(__dirname, '..', 'cache');

interface Agent {
  wallet: string;
  name: string;
  description: string;
  twitter?: string;
  verified_at: string;
}

interface LeaderboardEntry {
  wallet: string;
  name: string;
  twitter?: string;
  pnl_24h: number;
  pnl_7d: number;
  pnl_all: number;
  win_rate: number;
  total_trades: number;
  last_trade?: Trade;
}

// Load verified agents
export function loadVerifiedAgents(): Agent[] {
  const filePath = path.join(DATA_DIR, 'verified_agents.json');
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return [];
}

// Save verified agents
export function saveVerifiedAgents(agents: Agent[]) {
  const filePath = path.join(DATA_DIR, 'verified_agents.json');
  fs.writeFileSync(filePath, JSON.stringify(agents, null, 2));
}

// Get token price from Jupiter (free API)
async function getTokenPrice(mint: string): Promise<number> {
  if (mint === 'So11111111111111111111111111111111111111112' || mint === 'SOL') {
    // SOL price
    try {
      const res = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd');
      const data = await res.json() as any;
      return data.solana?.usd || 170; // Fallback
    } catch {
      return 170;
    }
  }
  
  // USDC/USDT = $1
  if (mint.startsWith('EPjFWdd') || mint.startsWith('Es9vMF')) {
    return 1;
  }
  
  // Try Jupiter price API
  try {
    const res = await fetch(`https://api.jup.ag/price/v2?ids=${mint}`);
    const data = await res.json() as any;
    return data.data?.[mint]?.price || 0;
  } catch {
    return 0;
  }
}

// Calculate PnL for trades within a time period
async function calculatePnL(trades: Trade[], periodHours: number): Promise<number> {
  const cutoff = Date.now() / 1000 - periodHours * 3600;
  const recentTrades = trades.filter(t => t.timestamp > cutoff);
  
  if (recentTrades.length === 0) return 0;
  
  // Simple PnL: value of tokens bought - SOL spent
  // For now, just count SOL spent on buys as negative PnL
  // Real PnL would need current token prices
  let pnl = 0;
  
  for (const trade of recentTrades) {
    if (trade.tokenIn === 'SOL' || trade.tokenInMint === 'So11111111111111111111111111111111111111112') {
      // Bought tokens with SOL
      const solPrice = await getTokenPrice('SOL');
      const outPrice = await getTokenPrice(trade.tokenOutMint);
      
      const spent = trade.amountIn * solPrice;
      const received = trade.amountOut * outPrice;
      pnl += received - spent;
    } else if (trade.tokenOut === 'SOL' || trade.tokenOutMint === 'So11111111111111111111111111111111111111112') {
      // Sold tokens for SOL
      const solPrice = await getTokenPrice('SOL');
      const inPrice = await getTokenPrice(trade.tokenInMint);
      
      const spent = trade.amountIn * inPrice;
      const received = trade.amountOut * solPrice;
      pnl += received - spent;
    }
  }
  
  return pnl;
}

// Calculate win rate (trades with positive outcome)
function calculateWinRate(trades: Trade[]): number {
  if (trades.length === 0) return 0;
  
  // For now, assume buys that were later sold for more SOL are wins
  // Simplified: count sells as wins if they got SOL back
  const sells = trades.filter(t => 
    t.tokenOut === 'SOL' || t.tokenOutMint === 'So11111111111111111111111111111111111111112'
  );
  
  if (sells.length === 0) return 0;
  return (sells.length / trades.length) * 100;
}

// Update leaderboard for all agents
export async function updateLeaderboard(): Promise<LeaderboardEntry[]> {
  console.log('Updating leaderboard...');
  
  const agents = loadVerifiedAgents();
  const leaderboard: LeaderboardEntry[] = [];
  
  for (const agent of agents) {
    console.log(`Processing ${agent.name} (${agent.wallet.slice(0, 8)}...)...`);
    
    // Fetch latest trades
    const trades = await getAgentTrades(agent.wallet, 50);
    cacheTrades(agent.wallet, trades);
    
    // Calculate stats
    const pnl_24h = await calculatePnL(trades, 24);
    const pnl_7d = await calculatePnL(trades, 168);
    const pnl_all = await calculatePnL(trades, 8760); // 1 year
    const win_rate = calculateWinRate(trades);
    
    leaderboard.push({
      wallet: agent.wallet,
      name: agent.name,
      twitter: agent.twitter,
      pnl_24h,
      pnl_7d,
      pnl_all,
      win_rate,
      total_trades: trades.length,
      last_trade: trades[0],
    });
    
    console.log(`  ${agent.name}: ${trades.length} trades, PnL 24h: $${pnl_24h.toFixed(2)}`);
  }
  
  // Sort by 24h PnL
  leaderboard.sort((a, b) => b.pnl_24h - a.pnl_24h);
  
  // Save to cache
  const cacheFile = path.join(CACHE_DIR, 'leaderboard.json');
  fs.writeFileSync(cacheFile, JSON.stringify(leaderboard, null, 2));
  
  // Update timestamp
  fs.writeFileSync(
    path.join(CACHE_DIR, 'last_update.json'),
    JSON.stringify({ timestamp: new Date().toISOString() })
  );
  
  console.log(`Leaderboard updated: ${leaderboard.length} agents`);
  return leaderboard;
}

// Load cached leaderboard
export function loadLeaderboard(): LeaderboardEntry[] {
  const filePath = path.join(CACHE_DIR, 'leaderboard.json');
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  }
  return [];
}

// Run if called directly
if (require.main === module) {
  updateLeaderboard().then(lb => {
    console.log('\n=== LEADERBOARD ===');
    lb.forEach((entry, i) => {
      console.log(`${i + 1}. ${entry.name}: $${entry.pnl_24h.toFixed(2)} (24h) | ${entry.total_trades} trades`);
    });
  });
}
