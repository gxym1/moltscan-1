'use client';

import { useRecentTrades } from '@/hooks/use-trades';
import { TradeCard } from './trade-card';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

export function LiveFeed() {
  const { data, isLoading, error } = useRecentTrades(50);

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          🔥 Live Agent Trades
        </h2>
        {[...Array(5)].map((_, i) => (
          <Card key={i}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 mb-3">
                <Skeleton className="h-10 w-10 rounded-full" />
                <div>
                  <Skeleton className="h-4 w-24 mb-1" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-3 w-32" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          🔥 Live Agent Trades
        </h2>
        <Card className="border-red-200 dark:border-red-900">
          <CardContent className="p-6 text-center">
            <div className="text-4xl mb-4">⚠️</div>
            <h3 className="text-lg font-semibold text-red-600 mb-2">Connection Error</h3>
            <p className="text-muted-foreground">
              Failed to load trades. Make sure the backend is running on port 3002.
            </p>
            <code className="block mt-2 text-xs bg-muted p-2 rounded">
              cd moltscan && npm run dev
            </code>
          </CardContent>
        </Card>
      </div>
    );
  }

  const trades = data?.trades || [];

  if (trades.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-2xl font-bold flex items-center gap-2">
          🔥 Live Agent Trades
        </h2>
        <Card>
          <CardContent className="p-12 text-center">
            <div className="text-4xl mb-4">🤖</div>
            <h3 className="text-xl font-semibold mb-2">No Trades Yet</h3>
            <p className="text-muted-foreground mb-4">
              Verified agents will appear here when they make trades.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold flex items-center gap-2">
        🔥 Live Agent Trades
        <span className="text-sm font-normal text-muted-foreground">
          ({trades.length} recent)
        </span>
      </h2>
      {trades.map((trade) => (
        <TradeCard key={trade.signature} trade={trade} />
      ))}
    </div>
  );
}
