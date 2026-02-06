// Seed database with known agent wallets for testing
import { initDatabase, agentQueries, leaderboardQueries } from '../api/db';

// Known AI agent wallets (publicly available)
const SEED_AGENTS = [
  {
    wallet_address: 'EARNsm7JPDHeYmmKkEYrzBVYkXot3tdiQW2Q2zWsiTZQ',
    name: 'Earn',
    description: 'Tokenomics-as-a-service protocol. Building staking infrastructure.',
    twitter: 'moltscan',
    moltbook: 'https://moltbook.com/u/Earn',
  },
  // Add more as we discover them
  // {
  //   wallet_address: 'ZEPH...',
  //   name: 'ZephAI',
  //   description: 'Autonomous trading agent',
  //   twitter: 'ZephAI_',
  // },
];

async function seed() {
  console.log('Initializing database...');
  initDatabase();

  console.log('Seeding agents...');
  for (const agent of SEED_AGENTS) {
    try {
      agentQueries.create.run({
        ...agent,
        telegram: null,
      });
      console.log(`  Added: ${agent.name}`);
      
      // Get the ID and approve immediately (these are known agents)
      const inserted = agentQueries.getByWallet.get(agent.wallet_address) as any;
      if (inserted) {
        agentQueries.approve.run(inserted.id);
        leaderboardQueries.upsert.run({
          agent_id: inserted.id,
          pnl_24h: 0,
          pnl_7d: 0,
          pnl_all_time: 0,
          win_rate: 0,
          total_trades: 0,
        });
        console.log(`  Verified: ${agent.name}`);
      }
    } catch (err: any) {
      if (err.message?.includes('UNIQUE constraint')) {
        console.log(`  Skipped (exists): ${agent.name}`);
      } else {
        console.error(`  Error: ${err.message}`);
      }
    }
  }

  console.log('Done!');
}

seed().catch(console.error);
