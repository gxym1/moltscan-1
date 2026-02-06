'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { Trade } from '@/lib/types';
import { truncateAddress, copyToClipboard } from '@/lib/utils';
import { ArrowRight, ExternalLink, Copy, Check } from 'lucide-react';

interface TradeCardProps {
  trade: Trade;
}

export function TradeCard({ trade }: TradeCardProps) {
  const [copied, setCopied] = useState(false);
  
  const action = trade.tokenIn === 'SOL' ? 'buy' : trade.tokenOut === 'SOL' ? 'sell' : 'swap';
  const actionColor = action === 'buy' ? 'bg-green-500' : action === 'sell' ? 'bg-red-500' : 'bg-blue-500';

  const handleCopy = async () => {
    await copyToClipboard(trade.wallet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Safe timestamp handling
  const timestamp = trade.timestamp ? trade.timestamp * 1000 : Date.now();
  const timeAgo = formatDistanceToNow(new Date(timestamp), { addSuffix: true });

  return (
    <Card className="hover:shadow-md transition-shadow hover:border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-start justify-between">
          {/* Left: Agent info */}
          <div className="flex items-center gap-3">
            <Avatar className="border-2 border-primary/20">
              <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white font-semibold">
                {(trade.agentName || trade.wallet?.slice(0, 2) || '??').slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <div className="font-semibold">{trade.agentName || truncateAddress(trade.wallet, 6)}</div>
              <div className="text-sm text-muted-foreground">
                {timeAgo}
              </div>
            </div>
          </div>

          {/* Right: Action badge */}
          <Badge className={`${actionColor} text-white`}>
            {action.toUpperCase()}
          </Badge>
        </div>

        {/* Trade details */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <span className="font-mono font-medium">{trade.amountIn?.toFixed(4) || '0'} {trade.tokenIn}</span>
            <ArrowRight className="w-4 h-4 text-muted-foreground" />
            <span className="font-mono font-medium">{trade.amountOut?.toLocaleString() || '0'} {trade.tokenOut}</span>
          </div>
          <Badge variant="outline" className="text-xs">
            {trade.dex}
          </Badge>
        </div>

        {/* Bottom row: wallet + links */}
        <div className="mt-3 flex items-center justify-between">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3 h-3 text-green-500" />
                <span className="text-green-500">Copied!</span>
              </>
            ) : (
              <>
                <Copy className="w-3 h-3" />
                <span className="font-mono">{truncateAddress(trade.wallet, 4)}</span>
              </>
            )}
          </button>
          
          <a
            href={`https://solscan.io/tx/${trade.signature}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            View on Solscan
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </CardContent>
    </Card>
  );
}
