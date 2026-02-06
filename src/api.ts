import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { loadVerifiedAgents, saveVerifiedAgents, loadLeaderboard, updateLeaderboard } from './leaderboard';
import { loadCachedTrades } from './rpc';

const app = express();
const PORT = process.env.PORT || 3002;

const DATA_DIR = path.join(__dirname, '..', 'data');
const CACHE_DIR = path.join(__dirname, '..', 'cache');

// Middleware
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ============ LEADERBOARD ============

// Get leaderboard (reads from cache)
app.get('/api/leaderboard', (req, res) => {
  const period = req.query.period as string || '24h';
  const leaderboard = loadLeaderboard();
  
  // Sort by requested period
  if (period === '7d') {
    leaderboard.sort((a, b) => b.pnl_7d - a.pnl_7d);
  } else if (period === 'all') {
    leaderboard.sort((a, b) => b.pnl_all - a.pnl_all);
  } else {
    leaderboard.sort((a, b) => b.pnl_24h - a.pnl_24h);
  }
  
  res.json({
    period,
    updated: getLastUpdate(),
    leaderboard: leaderboard.map((entry, i) => ({
      rank: i + 1,
      wallet: entry.wallet,
      name: entry.name,
      twitter: entry.twitter,
      pnl: period === '7d' ? entry.pnl_7d : period === 'all' ? entry.pnl_all : entry.pnl_24h,
      win_rate: entry.win_rate,
      total_trades: entry.total_trades,
    })),
  });
});

// ============ AGENTS ============

// Get all verified agents
app.get('/api/agents/verified', (req, res) => {
  const agents = loadVerifiedAgents();
  res.json({ agents: agents.map(a => a.wallet) });
});

// Get agent details + trades
app.get('/api/agents/:wallet', (req, res) => {
  const { wallet } = req.params;
  
  const agents = loadVerifiedAgents();
  const agent = agents.find(a => a.wallet === wallet);
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  const trades = loadCachedTrades(wallet);
  const leaderboard = loadLeaderboard();
  const stats = leaderboard.find(l => l.wallet === wallet);
  
  res.json({
    agent: {
      wallet: agent.wallet,
      name: agent.name,
      description: agent.description,
      twitter: agent.twitter,
      verified_at: agent.verified_at,
    },
    stats: stats ? {
      pnl_24h: stats.pnl_24h,
      pnl_7d: stats.pnl_7d,
      pnl_all: stats.pnl_all,
      win_rate: stats.win_rate,
      total_trades: stats.total_trades,
    } : null,
    trades: trades.slice(0, 50),
  });
});

// Get agent trades only
app.get('/api/agents/:wallet/trades', (req, res) => {
  const { wallet } = req.params;
  const limit = parseInt(req.query.limit as string) || 50;
  
  const trades = loadCachedTrades(wallet);
  res.json({ wallet, trades: trades.slice(0, limit) });
});

// ============ TRADES ============

// Get recent trades across all agents
app.get('/api/trades/recent', (req, res) => {
  const limit = parseInt(req.query.limit as string) || 20;
  
  const agents = loadVerifiedAgents();
  let allTrades: any[] = [];
  
  for (const agent of agents) {
    const trades = loadCachedTrades(agent.wallet);
    allTrades = allTrades.concat(trades.map(t => ({
      ...t,
      agentName: agent.name,
    })));
  }
  
  // Sort by timestamp descending
  allTrades.sort((a, b) => b.timestamp - a.timestamp);
  
  res.json({ trades: allTrades.slice(0, limit) });
});

// ============ REGISTRATION ============

// Register new agent (pending approval)
app.post('/api/register', (req, res) => {
  const { wallet_address, name, description, twitter, signature } = req.body;
  
  if (!wallet_address || !name) {
    return res.status(400).json({ error: 'wallet_address and name are required' });
  }
  
  // Check if already registered
  const agents = loadVerifiedAgents();
  if (agents.find(a => a.wallet === wallet_address)) {
    return res.status(409).json({ error: 'Agent already registered' });
  }
  
  // For now, auto-approve (in prod, this would go to pending queue)
  agents.push({
    wallet: wallet_address,
    name,
    description: description || '',
    twitter: twitter || undefined,
    verified_at: new Date().toISOString(),
  });
  
  saveVerifiedAgents(agents);
  
  res.status(201).json({
    success: true,
    message: 'Agent registered and verified',
    wallet: wallet_address,
  });
});

// ============ ADMIN ============

// Force leaderboard update
app.post('/api/admin/update', async (req, res) => {
  const adminKey = req.headers['x-admin-key'];
  if (adminKey !== (process.env.ADMIN_KEY || 'moltscan-admin')) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  try {
    const leaderboard = await updateLeaderboard();
    res.json({ success: true, agents: leaderboard.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ============ HELPERS ============

function getLastUpdate(): string {
  const filePath = path.join(CACHE_DIR, 'last_update.json');
  if (fs.existsSync(filePath)) {
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    return data.timestamp;
  }
  return 'never';
}

// Ensure cache dirs exist
if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
if (!fs.existsSync(path.join(CACHE_DIR, 'agents'))) fs.mkdirSync(path.join(CACHE_DIR, 'agents'));

// Start server
app.listen(PORT, () => {
  console.log(`🤖 MOLTSCAN API running on port ${PORT}`);
  console.log(`   Leaderboard: http://localhost:${PORT}/api/leaderboard`);
  console.log(`   Agents: http://localhost:${PORT}/api/agents/verified`);
});

export default app;
