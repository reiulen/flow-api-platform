import React, { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Users,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Zap,
  ShieldCheck
} from 'lucide-react';
import type { Account } from '@/lib/api';

interface AccountsProps {
  accounts: Account[];
  onRefresh?: () => void;
  onOpenCredits?: () => void;
  onSyncAccountCredits?: (accountId: string) => Promise<void>;
}

export const AccountsView: React.FC<AccountsProps> = ({
  accounts,
  onRefresh,
  onOpenCredits,
  onSyncAccountCredits,
}) => {
  const [syncingId, setSyncingId] = useState<string | null>(null);

  const handleSyncAccount = async (id: string) => {
    if (!onSyncAccountCredits) return;
    setSyncingId(id);
    try {
      await onSyncAccountCredits(id);
    } finally {
      setSyncingId(null);
    }
  };

  const formatDate = (dateStr?: string | null) => {
    if (!dateStr) return 'Not checked';
    try {
      const d = new Date(dateStr);
      return (
        d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) +
        ', ' +
        d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
      );
    } catch {
      return dateStr;
    }
  };

  const totalCredits = accounts.reduce((acc, a) => acc + (a.creditsRemaining || 0), 0);
  const readyCount = accounts.filter((a) => a.status === 'ready').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Accounts pool
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage generation accounts and quota allocation.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenCredits && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs gap-1.5"
              onClick={onOpenCredits}
            >
              <Zap className="size-3.5 text-muted-foreground" />
              <span>Pool telemetry</span>
            </Button>
          )}
          <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={onRefresh}>
            <RefreshCw className="size-3.5" />
            <span>Refresh</span>
          </Button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg border border-border bg-surface p-3.5">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Total accounts
          </div>
          <div className="text-2xl font-bold font-mono text-foreground mt-1">
            {accounts.length}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-3.5">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Ready instances
          </div>
          <div className="text-2xl font-bold font-mono text-foreground mt-1">
            {readyCount} / {accounts.length}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-surface p-3.5">
          <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            Total stored credits
          </div>
          <div className="text-2xl font-bold font-mono text-foreground mt-1">
            {totalCredits.toLocaleString()} cr
          </div>
        </div>
      </div>

      {/* Main Accounts Table */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Account ID</TableHead>
              <TableHead>Profile Chrome</TableHead>
              <TableHead>Project ID Flow</TableHead>
              <TableHead className="text-right">Credits (DB)</TableHead>
              <TableHead>Last checked</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead className="text-right">Status</TableHead>
              <TableHead className="w-[80px] text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {accounts.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-8 text-muted-foreground text-xs">
                  No accounts found in pool.
                </TableCell>
              </TableRow>
            ) : (
              accounts.map((acc) => {
                const rem = acc.creditsRemaining ?? 0;
                const isSyncing = syncingId === acc.id;

                return (
                  <TableRow key={acc.id}>
                    <TableCell className="font-mono text-xs font-medium text-foreground">
                      {acc.id}
                    </TableCell>
                    <TableCell className="text-xs">
                      <span className="font-mono text-foreground">
                        {acc.profileName}
                      </span>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono truncate max-w-[140px]">
                      {acc.projectId || 'Default project'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold text-foreground">
                      {acc.creditsRemaining != null ? acc.creditsRemaining.toLocaleString() : 'N/A'}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {formatDate(acc.creditsCheckedAt)}
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      <span className="text-[11px] px-1.5 py-0.5 rounded-xs border border-border bg-surface-subtle">
                        P{acc.priority}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge
                        variant={
                          acc.status === 'ready'
                            ? 'success'
                            : acc.status === 'paused'
                              ? 'warning'
                              : 'destructive'
                        }
                        className="text-[11px] gap-1"
                      >
                        {acc.status === 'ready' ? (
                          <CheckCircle2 className="size-3" />
                        ) : (
                          <AlertTriangle className="size-3" />
                        )}
                        <span>{acc.status}</span>
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-7 text-muted-foreground hover:text-foreground"
                        title="Sync credit from Flow"
                        onClick={() => handleSyncAccount(acc.id)}
                        disabled={isSyncing}
                      >
                        <RefreshCw className={`size-3 ${isSyncing ? 'animate-spin' : ''}`} />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Operational Policy Cards */}
      <div className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-border bg-surface p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <ShieldCheck className="size-3.5 text-muted-foreground" />
            <span>Persistent session store</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Worker pool keeps authenticated session state in local profile storage to prevent re-authentication overhead.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <ShieldCheck className="size-3.5 text-muted-foreground" />
            <span>Concurrency governor</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Each account is locked to a single active rendering worker to avoid tab collisions and rate limiting.
          </p>
        </div>

        <div className="rounded-lg border border-border bg-surface p-3.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
            <ShieldCheck className="size-3.5 text-muted-foreground" />
            <span>Zero-downtime failover</span>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            When an account reaches 0 credits, routing automatically reassigns pending jobs to the next available account.
          </p>
        </div>
      </div>
    </div>
  );
};
