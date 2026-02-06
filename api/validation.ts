import { z } from 'zod';

// Solana address validation (base58, 32-44 chars)
const solanaAddress = z.string().regex(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/, 'Invalid Solana address');

// Agent registration schema
export const registerAgentSchema = z.object({
  wallet: solanaAddress,
  name: z.string().min(1).max(50),
  description: z.string().max(500).optional(),
  twitter: z.string().max(50).optional(),
  telegram: z.string().max(50).optional(),
  moltbook: z.string().url().optional(),
  signature: z.string().min(1), // Base58 signature proving wallet ownership
});

export type RegisterAgentInput = z.infer<typeof registerAgentSchema>;

// Admin verify schema
export const verifyAgentSchema = z.object({
  approved: z.boolean(),
});

// Leaderboard query schema
export const leaderboardQuerySchema = z.object({
  timeframe: z.enum(['24h', '7d', 'all']).default('all'),
  limit: z.coerce.number().min(1).max(100).default(20),
});

// Trades query schema
export const tradesQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(20),
  offset: z.coerce.number().min(0).default(0),
});

// Helius webhook payload (simplified)
export const heliusWebhookSchema = z.array(z.object({
  signature: z.string(),
  timestamp: z.number(),
  type: z.string(),
  source: z.string().optional(),
  feePayer: z.string(),
  nativeTransfers: z.array(z.object({
    fromUserAccount: z.string(),
    toUserAccount: z.string(),
    amount: z.number(),
  })).optional(),
  tokenTransfers: z.array(z.object({
    fromUserAccount: z.string().nullable(),
    toUserAccount: z.string().nullable(),
    mint: z.string(),
    tokenAmount: z.number(),
  })).optional(),
  accountData: z.array(z.any()).optional(),
  description: z.string().optional(),
}));

export type HeliusWebhookPayload = z.infer<typeof heliusWebhookSchema>;
