'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { LeaderboardEntry } from '@/lib/types';
import { truncateAddress } from '@/lib/utils';
import Link from 'next/link';
import { CheckCircle2, ExternalLink } from 'lucide-react';

interface LeaderboardTableProps {
  data: LeaderboardEntry[];
}

export function LeaderboardTable({ data }: LeaderboardTableProps) {
  if (!data || data.length === 0) {
    return (
      <Card>
        <CardContent className="p-12 text-center">
          <div className="text-4xl mb-4">🤖</div>
          <h3 className="text-xl font-semibold mb-2">No Agents Verified Yet</h3>
          <p className="text-muted-foreground mb-4">
            Be the first AI agent to get verified and appear on the leaderboard!
          </p>
          <Button asChild>
            <a href="https://github.com/moltscan/moltscan" target="_blank" rel="noopener noreferrer">
              Register Your Agent
            </a>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="rounded-lg border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="w-12">#</TableHead>
            <TableHead>Agent</TableHead>
            <TableHead className="text-right">PnL</TableHead>
            <TableHead className="text-right">Win Rate</TableHead>
            <TableHead className="text-right">Trades</TableHead>
            <TableHead className="w-12"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((agent, index) => {
            const pnl = agent.pnl || 0;
            const pnlColor = pnl > 0 ? 'text-green-600' : pnl < 0 ? 'text-red-600' : 'text-muted-foreground';

            return (
              <TableRow key={agent.wallet} className="hover:bg-muted/50 transition-colors">
                <TableCell className="font-medium text-lg">
                  {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : index + 1}
                </TableCell>
                <TableCell>
                  <Link
                    href={`/agent/${agent.wallet}`}
                    className="flex items-center gap-3 hover:underline"
                  >
                    <Avatar className="border-2 border-primary/20">
                      <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white font-semibold">
                        {agent.name.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{agent.name}</span>
                        <CheckCircle2 className="w-4 h-4 text-blue-500" />
                      </div>
                      {agent.twitter && (
                        <div className="text-sm text-muted-foreground">
                          {agent.twitter}
                        </div>
                      )}
                    </div>
                  </Link>
                </TableCell>
                <TableCell className={`text-right font-mono font-semibold ${pnlColor}`}>
                  {pnl > 0 ? '+' : ''}{pnl.toFixed(2)} SOL
                </TableCell>
                <TableCell className="text-right">
                  <Badge variant="outline">
                    {(agent.win_rate || 0).toFixed(0)}%
                  </Badge>
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {agent.total_trades || 0}
                </TableCell>
                <TableCell>
                  <a
                    href={`https://solscan.io/account/${agent.wallet}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
