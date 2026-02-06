import { LeaderboardEntry, Trade, AgentStats, Agent } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3002';

export const api = {
  // Get leaderboard
  async getLeaderboard(period: '24h' | '7d' | 'all' = '24h') {
    try {
      const res = await fetch(`${API_BASE}/api/leaderboard?period=${period}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Leaderboard error:', errorText);
        throw new Error(`Failed to fetch leaderboard: ${res.status}`);
      }
      const data = await res.json();
      return data;
    } catch (error) {
      console.error('Leaderboard API error:', error);
      throw error;
    }
  },

  // Get recent trades
  async getRecentTrades(limit = 50) {
    try {
      const res = await fetch(`${API_BASE}/api/trades/recent?limit=${limit}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Trades error:', errorText);
        throw new Error(`Failed to fetch trades: ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      console.error('Trades API error:', error);
      throw error;
    }
  },

  // Get agent profile
  async getAgent(wallet: string): Promise<AgentStats> {
    try {
      const res = await fetch(`${API_BASE}/api/agents/${wallet}`);
      if (!res.ok) {
        const errorText = await res.text();
        console.error('Agent error:', errorText);
        throw new Error(`Failed to fetch agent: ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      console.error('Agent API error:', error);
      throw error;
    }
  },

  // Get agent trades
  async getAgentTrades(wallet: string, limit = 100) {
    try {
      const res = await fetch(`${API_BASE}/api/agents/${wallet}/trades?limit=${limit}`);
      if (!res.ok) {
        throw new Error(`Failed to fetch agent trades: ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      console.error('Agent trades API error:', error);
      throw error;
    }
  },

  // Get verified agents list
  async getVerifiedAgents(): Promise<string[]> {
    try {
      const res = await fetch(`${API_BASE}/api/agents/verified`);
      if (!res.ok) {
        throw new Error(`Failed to fetch agents: ${res.status}`);
      }
      const data = await res.json();
      return data.agents || [];
    } catch (error) {
      console.error('Verified agents API error:', error);
      throw error;
    }
  },
};
