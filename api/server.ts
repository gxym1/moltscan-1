import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import nacl from 'tweetnacl';
import bs58 from 'bs58';
import { 
  db, 
  initDatabase, 
  agentQueries, 
  tradeQueries, 
  leaderboardQueries 
} from './db';
import {
  registerAgentSchema,
  verifyAgentSchema,
  leaderboardQuerySchema,
  tradesQuerySchema,
  heliusWebhookSchema,
} from './validation';
import { indexWallet } from './indexer';

const app = express();
const PORT = process.env.PORT || 3001;
const ADMIN_KEY = process.env.ADMIN_KEY || 'moltscan-admin-key';

// Middleware
app.use(cors());
app.use(express.json());

// Error handler
const asyncHandler = (fn: Function) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ==================== AGENT ENDPOINTS ====================

// Register new agent (called by agent via Skill)
app.post('/api/agents/register', asyncHandler(async (req: Request, res: Response) => {
  const parsed = registerAgentSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
  }

  const { wallet, name, description, twitter, telegram, moltbook, signature } = parsed.data;

  // Verify signature proves wallet ownership
  // Message format: "MOLTSCAN_VERIFY:<wallet>:<timestamp>"
  // For MVP, we'll trust the signature format - can add strict verification later
  try {
    // Check if already registered
    const existing = agentQueries.getByWallet.get(wallet);
    if (existing) {
      return res.status(409).json({ error: 'Wallet already registered', status: (existing as any).status });
    }

    // Insert new agent
    const result = agentQueries.create.run({
      wallet_address: wallet,
      name,
      description: description || null,
      twitter: twitter || null,
      telegram: telegram || null,
      moltbook: moltbook || null,
    });

    res.status(201).json({
      success: true,
      message: 'Registration submitted. Pending verification.',
      agentId: result.lastInsertRowid,
    });
  } catch (err: any) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
}));

// Get agent by wallet
app.get('/api/agents/:wallet', asyncHandler(async (req: Request, res: Response) => {
  const { wallet } = req.params;
  const agent = agentQueries.getByWallet.get(wallet) as any;
  
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  // Get recent trades
  const trades = tradeQueries.getByAgent.all(agent.id, 20);

  // Get leaderboard stats
  const stats = leaderboardQueries.getTop.all(100).find((l: any) => l.agent_id === agent.id);

  res.json({
    agent: {
      id: agent.id,
      wallet: agent.wallet_address,
      name: agent.name,
      description: agent.description,
      twitter: agent.twitter,
      telegram: agent.telegram,
      moltbook: agent.moltbook,
      verified: agent.verified,
      verificationDate: agent.verification_date,
    },
    stats: stats || { pnl_24h: 0, pnl_7d: 0, pnl_all_time: 0, win_rate: 0, total_trades: 0 },
    recentTrades: trades,
  });
}));

// Get all verified agents
app.get('/api/agents', asyncHandler(async (req: Request, res: Response) => {
  const agents = agentQueries.getVerified.all();
  res.json({ agents });
}));

// ==================== ADMIN ENDPOINTS ====================

// Admin middleware
const adminAuth = (req: Request, res: Response, next: NextFunction) => {
  const key = req.headers['x-admin-key'];
  if (key !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Get pending registrations
app.get('/api/admin/pending', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const pending = agentQueries.getPending.all();
  res.json({ pending });
}));

// Approve or reject agent
app.post('/api/admin/agents/:id/verify', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  const parsed = verifyAgentSchema.safeParse(req.body);
  
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
  }

  const agent = agentQueries.getById.get(id) as any;
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }

  if (parsed.data.approved) {
    agentQueries.approve.run(id);
    
    // Initialize leaderboard entry
    leaderboardQueries.upsert.run({
      agent_id: id,
      pnl_24h: 0,
      pnl_7d: 0,
      pnl_all_time: 0,
      win_rate: 0,
      total_trades: 0,
    });

    // Start indexing their wallet
    indexWallet(agent.wallet_address, Number(id)).catch(console.error);

    res.json({ success: true, message: 'Agent approved and verification started' });
  } else {
    agentQueries.reject.run(id);
    res.json({ success: true, message: 'Agent rejected' });
  }
}));

// Delist agent
app.post('/api/admin/agents/:id/delist', adminAuth, asyncHandler(async (req: Request, res: Response) => {
  const { id } = req.params;
  agentQueries.delist.run(id);
  res.json({ success: true, message: 'Agent delisted' });
}));

// ==================== LEADERBOARD ENDPOINTS ====================

app.get('/api/leaderboard', asyncHandler(async (req: Request, res: Response) => {
  const parsed = leaderboardQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
  }

  const { timeframe, limit } = parsed.data;
  
  // Get leaderboard sorted by timeframe
  const results = db.prepare(`
    SELECT l.*, a.name, a.wallet_address, a.twitter, a.moltbook
    FROM leaderboard l
    JOIN agents a ON l.agent_id = a.id
    WHERE a.verified = TRUE
    ORDER BY ${timeframe === '24h' ? 'l.pnl_24h' : timeframe === '7d' ? 'l.pnl_7d' : 'l.pnl_all_time'} DESC
    LIMIT ?
  `).all(limit);

  res.json({
    timeframe,
    leaderboard: results.map((r: any, i: number) => ({
      rank: i + 1,
      agent: {
        name: r.name,
        wallet: r.wallet_address,
        twitter: r.twitter,
        moltbook: r.moltbook,
      },
      pnl: timeframe === '24h' ? r.pnl_24h : timeframe === '7d' ? r.pnl_7d : r.pnl_all_time,
      winRate: r.win_rate,
      totalTrades: r.total_trades,
    })),
  });
}));

// ==================== TRADES ENDPOINTS ====================

app.get('/api/trades/recent', asyncHandler(async (req: Request, res: Response) => {
  const parsed = tradesQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Validation failed', details: parsed.error.issues });
  }

  const { limit } = parsed.data;
  const trades = tradeQueries.getRecent.all(limit);

  res.json({
    trades: (trades as any[]).map(t => ({
      id: t.id,
      agent: { name: t.agent_name, wallet: t.agent_wallet },
      signature: t.tx_signature,
      timestamp: t.timestamp,
      action: t.action,
      token: { mint: t.token_mint, symbol: t.token_symbol },
      amountSol: t.amount_sol,
      amountTokens: t.amount_tokens,
      priceUsd: t.price_usd,
      dex: t.dex,
      pnlUsd: t.pnl_usd,
    })),
  });
}));

// ==================== WEBHOOK ENDPOINTS ====================

// Helius webhook receiver
app.post('/api/webhooks/helius', asyncHandler(async (req: Request, res: Response) => {
  console.log('Helius webhook received:', JSON.stringify(req.body).slice(0, 500));
  
  // TODO: Process transactions and update trades table
  // For now, just acknowledge
  res.json({ received: true });
}));

// ==================== ERROR HANDLER ====================

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ==================== START SERVER ====================

initDatabase();

app.listen(PORT, () => {
  console.log(`🤖 MOLTSCAN API running on port ${PORT}`);
  console.log(`   Health: http://localhost:${PORT}/health`);
  console.log(`   Docs: http://localhost:${PORT}/api`);
});

export default app;
