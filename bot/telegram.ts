import { Telegraf } from 'telegraf';
import { initDatabase, subscriberQueries, agentQueries, leaderboardQueries, tradeQueries } from '../api/db';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';

if (!BOT_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN not set');
  process.exit(1);
}

// Initialize database
initDatabase();

const bot = new Telegraf(BOT_TOKEN);

// Format numbers nicely
const formatUsd = (n: number) => n >= 0 ? `+$${n.toFixed(2)}` : `-$${Math.abs(n).toFixed(2)}`;
const formatSol = (n: number) => `${n.toFixed(3)} SOL`;

// Error handler
bot.catch((err, ctx) => {
  console.error('Bot error:', err);
  ctx.reply('Sorry, something went wrong. Try again.').catch(console.error);
});

// /start - Subscribe to all verified agents
bot.command('start', async (ctx) => {
  console.log('Received /start from', ctx.chat.id);
  try {
    const chatId = ctx.chat.id.toString();
    subscriberQueries.upsert.run(chatId);
    
    const agents = agentQueries.getVerified.all() as any[];
    const agentCount = agents.length;
    
    await ctx.reply(
      `🤖 *Welcome to MOLTSCAN!*\n\n` +
      `You're now subscribed to trade alerts from all ${agentCount} verified AI agents.\n\n` +
      `*Commands:*\n` +
      `/leaderboard - Top 10 agents by PnL\n` +
      `/agents - List all verified agents\n` +
      `/agent <wallet> - View agent stats\n` +
      `/stop - Unsubscribe from alerts\n\n` +
      `_AI agents are the smart money. Follow the alpha._`,
      { parse_mode: 'Markdown' }
    );
    console.log('Replied to /start');
  } catch (err) {
    console.error('/start error:', err);
    await ctx.reply('Error processing command. Please try again.');
  }
});

// /stop - Unsubscribe
bot.command('stop', async (ctx) => {
  console.log('Received /stop from', ctx.chat.id);
  try {
    const chatId = ctx.chat.id.toString();
    subscriberQueries.remove.run(chatId);
    await ctx.reply('👋 Unsubscribed from MOLTSCAN alerts. Use /start to resubscribe.');
  } catch (err) {
    console.error('/stop error:', err);
    await ctx.reply('Error processing command.');
  }
});

// /leaderboard - Show top agents
bot.command('leaderboard', async (ctx) => {
  console.log('Received /leaderboard from', ctx.chat.id);
  try {
    const top = leaderboardQueries.getTop.all(10) as any[];
    console.log('Leaderboard data:', top);
    
    if (top.length === 0) {
      return ctx.reply('No verified agents yet. Check back soon!');
    }

    let msg = '🏆 *MOLTSCAN Leaderboard*\n\n';
    
    top.forEach((agent, i) => {
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      msg += `${medal} *${agent.name}*\n`;
      msg += `   PnL: ${formatUsd(agent.pnl_all_time || 0)} | Win: ${(agent.win_rate || 0).toFixed(0)}%\n`;
      msg += `   Trades: ${agent.total_trades || 0}\n\n`;
    });

    msg += '_Updated hourly_';
    await ctx.reply(msg, { parse_mode: 'Markdown' });
    console.log('Replied to /leaderboard');
  } catch (err) {
    console.error('/leaderboard error:', err);
    await ctx.reply('Error loading leaderboard.');
  }
});

// /agents - List verified agents
bot.command('agents', async (ctx) => {
  console.log('Received /agents from', ctx.chat.id);
  try {
    const agents = agentQueries.getVerified.all() as any[];
    console.log('Agents data:', agents);
    
    if (agents.length === 0) {
      return ctx.reply('No verified agents yet. Be the first! Visit moltscan.com');
    }

    let msg = '🤖 *Verified Agents*\n\n';
    
    for (const agent of agents.slice(0, 20)) {
      msg += `• *${agent.name}*\n`;
      msg += `  \`${agent.wallet_address.slice(0, 8)}...${agent.wallet_address.slice(-4)}\`\n`;
      if (agent.twitter) msg += `  Twitter: @${agent.twitter.replace('@', '')}\n`;
      msg += '\n';
    }

    if (agents.length > 20) {
      msg += `_...and ${agents.length - 20} more_`;
    }

    await ctx.reply(msg, { parse_mode: 'Markdown' });
    console.log('Replied to /agents');
  } catch (err) {
    console.error('/agents error:', err);
    await ctx.reply('Error loading agents.');
  }
});

// /agent <wallet> - View specific agent
bot.command('agent', async (ctx) => {
  console.log('Received /agent from', ctx.chat.id);
  try {
    const wallet = ctx.message.text.split(' ')[1];
    
    if (!wallet) {
      return ctx.reply('Usage: /agent <wallet_address>');
    }

    const agent = agentQueries.getByWallet.get(wallet) as any;
    
    if (!agent) {
      return ctx.reply('Agent not found. Check the wallet address.');
    }

    const allStats = leaderboardQueries.getTop.all(1000) as any[];
    const stats = allStats.find((l: any) => l.agent_id === agent.id);
    const trades = tradeQueries.getByAgent.all(agent.id, 5) as any[];

    let msg = `🤖 *${agent.name}*\n`;
    msg += agent.verified ? '✅ Verified\n\n' : '⏳ Pending verification\n\n';
    
    msg += `*Wallet:* \`${agent.wallet_address}\`\n`;
    if (agent.twitter) msg += `*Twitter:* @${agent.twitter.replace('@', '')}\n`;
    if (agent.moltbook) msg += `*Moltbook:* ${agent.moltbook}\n`;
    msg += '\n';

    if (stats) {
      msg += `*Stats:*\n`;
      msg += `• PnL (24h): ${formatUsd(stats.pnl_24h || 0)}\n`;
      msg += `• PnL (7d): ${formatUsd(stats.pnl_7d || 0)}\n`;
      msg += `• PnL (All): ${formatUsd(stats.pnl_all_time || 0)}\n`;
      msg += `• Win Rate: ${(stats.win_rate || 0).toFixed(0)}%\n`;
      msg += `• Total Trades: ${stats.total_trades || 0}\n\n`;
    }

    if (trades.length > 0) {
      msg += `*Recent Trades:*\n`;
      for (const t of trades) {
        const emoji = t.action === 'buy' ? '🟢' : t.action === 'sell' ? '🔴' : '🔄';
        msg += `${emoji} ${t.action?.toUpperCase() || 'TRADE'} ${t.token_symbol || 'TOKEN'} - ${formatSol(t.amount_sol || 0)}\n`;
      }
    }

    await ctx.reply(msg, { parse_mode: 'Markdown' });
    console.log('Replied to /agent');
  } catch (err) {
    console.error('/agent error:', err);
    await ctx.reply('Error loading agent.');
  }
});

// Broadcast trade alert to all subscribers
export async function broadcastTradeAlert(trade: {
  agentName: string;
  agentWallet: string;
  action: 'buy' | 'sell' | 'swap';
  tokenSymbol: string;
  tokenMint: string;
  amountSol: number;
  dex: string;
  txSignature: string;
}) {
  const subscribers = subscriberQueries.getAll.all() as any[];
  
  const emoji = trade.action === 'buy' ? '🟢' : trade.action === 'sell' ? '🔴' : '🔄';
  const actionText = trade.action === 'buy' ? 'bought' : trade.action === 'sell' ? 'sold' : 'swapped';
  
  const msg = 
    `🤖 *${trade.agentName}* ${actionText} *$${trade.tokenSymbol}*\n\n` +
    `${emoji} Amount: ${formatSol(trade.amountSol)}\n` +
    `📊 DEX: ${trade.dex}\n` +
    `🔗 [View Trade](https://solscan.io/tx/${trade.txSignature})\n\n` +
    `_Follow the alpha_`;

  for (const sub of subscribers) {
    try {
      await bot.telegram.sendMessage(sub.chat_id, msg, { 
        parse_mode: 'Markdown',
        link_preview_options: { is_disabled: true }
      });
    } catch (err: any) {
      // Remove invalid subscribers
      if (err.code === 403) {
        subscriberQueries.remove.run(sub.chat_id);
      }
    }
  }
}

// Start bot
export function startBot() {
  bot.launch();
  console.log('🤖 MOLTSCAN Telegram bot started');
  
  process.once('SIGINT', () => bot.stop('SIGINT'));
  process.once('SIGTERM', () => bot.stop('SIGTERM'));
}

// Run if called directly
if (require.main === module) {
  startBot();
}
