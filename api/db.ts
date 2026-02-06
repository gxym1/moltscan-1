import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'moltscan.db');

export const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent access
db.pragma('journal_mode = WAL');

export function initDatabase() {
  db.exec(`
    -- Agents table
    CREATE TABLE IF NOT EXISTS agents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_address TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      twitter TEXT,
      telegram TEXT,
      moltbook TEXT,
      verified BOOLEAN DEFAULT FALSE,
      verification_date TIMESTAMP,
      status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected', 'delisted')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Trades table
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_id INTEGER REFERENCES agents(id),
      tx_signature TEXT UNIQUE NOT NULL,
      timestamp TIMESTAMP NOT NULL,
      action TEXT CHECK(action IN ('buy', 'sell', 'swap')),
      token_mint TEXT NOT NULL,
      token_symbol TEXT,
      amount_sol REAL,
      amount_tokens REAL,
      price_usd REAL,
      dex TEXT,
      pnl_usd REAL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Leaderboard cache (updated hourly)
    CREATE TABLE IF NOT EXISTS leaderboard (
      agent_id INTEGER PRIMARY KEY REFERENCES agents(id),
      pnl_24h REAL DEFAULT 0,
      pnl_7d REAL DEFAULT 0,
      pnl_all_time REAL DEFAULT 0,
      win_rate REAL DEFAULT 0,
      total_trades INTEGER DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Telegram subscribers
    CREATE TABLE IF NOT EXISTS subscribers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT UNIQUE NOT NULL,
      subscribed_all BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    -- Subscriber -> Agent follows (if not subscribed_all)
    CREATE TABLE IF NOT EXISTS follows (
      subscriber_id INTEGER REFERENCES subscribers(id),
      agent_id INTEGER REFERENCES agents(id),
      PRIMARY KEY (subscriber_id, agent_id)
    );

    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_trades_agent ON trades(agent_id);
    CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp);
    CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
    CREATE INDEX IF NOT EXISTS idx_agents_verified ON agents(verified);
  `);

  console.log('Database initialized');
}

// Agent operations
export const agentQueries = {
  create: db.prepare(`
    INSERT INTO agents (wallet_address, name, description, twitter, telegram, moltbook)
    VALUES (@wallet_address, @name, @description, @twitter, @telegram, @moltbook)
  `),

  getByWallet: db.prepare(`
    SELECT * FROM agents WHERE wallet_address = ?
  `),

  getById: db.prepare(`
    SELECT * FROM agents WHERE id = ?
  `),

  getPending: db.prepare(`
    SELECT * FROM agents WHERE status = 'pending' ORDER BY created_at ASC
  `),

  getVerified: db.prepare(`
    SELECT * FROM agents WHERE verified = TRUE ORDER BY name ASC
  `),

  approve: db.prepare(`
    UPDATE agents 
    SET verified = TRUE, status = 'approved', verification_date = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `),

  reject: db.prepare(`
    UPDATE agents SET status = 'rejected', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `),

  delist: db.prepare(`
    UPDATE agents SET verified = FALSE, status = 'delisted', updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `),
};

// Trade operations
export const tradeQueries = {
  insert: db.prepare(`
    INSERT OR IGNORE INTO trades (agent_id, tx_signature, timestamp, action, token_mint, token_symbol, amount_sol, amount_tokens, price_usd, dex, pnl_usd)
    VALUES (@agent_id, @tx_signature, @timestamp, @action, @token_mint, @token_symbol, @amount_sol, @amount_tokens, @price_usd, @dex, @pnl_usd)
  `),

  getByAgent: db.prepare(`
    SELECT * FROM trades WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?
  `),

  getRecent: db.prepare(`
    SELECT t.*, a.name as agent_name, a.wallet_address as agent_wallet
    FROM trades t
    JOIN agents a ON t.agent_id = a.id
    WHERE a.verified = TRUE
    ORDER BY t.timestamp DESC
    LIMIT ?
  `),
};

// Leaderboard operations
export const leaderboardQueries = {
  upsert: db.prepare(`
    INSERT INTO leaderboard (agent_id, pnl_24h, pnl_7d, pnl_all_time, win_rate, total_trades, updated_at)
    VALUES (@agent_id, @pnl_24h, @pnl_7d, @pnl_all_time, @win_rate, @total_trades, CURRENT_TIMESTAMP)
    ON CONFLICT(agent_id) DO UPDATE SET
      pnl_24h = @pnl_24h,
      pnl_7d = @pnl_7d,
      pnl_all_time = @pnl_all_time,
      win_rate = @win_rate,
      total_trades = @total_trades,
      updated_at = CURRENT_TIMESTAMP
  `),

  getTop: db.prepare(`
    SELECT l.*, a.name, a.wallet_address, a.twitter, a.moltbook
    FROM leaderboard l
    JOIN agents a ON l.agent_id = a.id
    WHERE a.verified = TRUE
    ORDER BY l.pnl_all_time DESC
    LIMIT ?
  `),

  getByTimeframe: db.prepare(`
    SELECT l.*, a.name, a.wallet_address, a.twitter, a.moltbook
    FROM leaderboard l
    JOIN agents a ON l.agent_id = a.id
    WHERE a.verified = TRUE
    ORDER BY 
      CASE ? 
        WHEN '24h' THEN l.pnl_24h
        WHEN '7d' THEN l.pnl_7d
        ELSE l.pnl_all_time
      END DESC
    LIMIT ?
  `),
};

// Subscriber operations
export const subscriberQueries = {
  upsert: db.prepare(`
    INSERT INTO subscribers (chat_id, subscribed_all)
    VALUES (?, TRUE)
    ON CONFLICT(chat_id) DO UPDATE SET subscribed_all = TRUE
  `),

  getByChatId: db.prepare(`
    SELECT * FROM subscribers WHERE chat_id = ?
  `),

  getAll: db.prepare(`
    SELECT * FROM subscribers
  `),

  remove: db.prepare(`
    DELETE FROM subscribers WHERE chat_id = ?
  `),
};
