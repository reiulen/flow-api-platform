import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  RefreshCw,
  Database,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import { api, type CreditsSummary } from '@/lib/api';

interface CreditsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  creditsSummary: CreditsSummary | null;
  onCreditsUpdated: (updated: CreditsSummary) => void;
}

export const CreditsDialog: React.FC<CreditsDialogProps> = ({
  open,
  onOpenChange,
  creditsSummary,
  onCreditsUpdated,
}) => {
  const [isSyncingAll, setIsSyncingAll] = useState(false);
  const [syncingAccountId, setSyncingAccountId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const handleSyncAll = async () => {
    setIsSyncingAll(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await api.refreshCredits();
      if ('totalCreditsRemaining' in res) {
        onCreditsUpdated(res as CreditsSummary);
        setSuccessMsg('All account pool balances refreshed successfully.');
        setTimeout(() => setSuccessMsg(null), 3000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to refresh credits from Flow');
    } finally {
      setIsSyncingAll(false);
    }
  };

  const handleSyncSingle = async (accountId: string) => {
    setSyncingAccountId(accountId);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      await api.refreshCredits(accountId);
      const summary = await api.getCredits();
      onCreditsUpdated(summary);
      setSuccessMsg('Account balance refreshed.');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to refresh account credit');
    } finally {
      setSyncingAccountId(null);
    }
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Never checked';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const total = creditsSummary?.totalCreditsRemaining ?? 0;
  const accounts = creditsSummary?.data || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Credit pool balances
          </DialogTitle>
          <DialogDescription>
            Active pool quota and account allocation for Google Flow rendering instances.
          </DialogDescription>
        </DialogHeader>

        {/* Utilitarian Metric Strip */}
        <div className="rounded-lg border border-border bg-surface-subtle p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Total available credits
            </div>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-3xl font-bold font-mono tracking-tight text-foreground">
                {total.toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">credits across {accounts.length} accounts</span>
            </div>
          </div>

          <Button
            onClick={handleSyncAll}
            disabled={isSyncingAll || syncingAccountId !== null}
            size="sm"
            className="text-xs shrink-0"
          >
            <RefreshCw className={`size-3.5 mr-1.5 ${isSyncingAll ? 'animate-spin' : ''}`} />
            <span>{isSyncingAll ? 'Syncing...' : 'Sync all accounts'}</span>
          </Button>
        </div>

        {successMsg && (
          <div className="p-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {errorMsg && (
          <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-destructive text-xs flex items-center gap-1.5">
            <AlertTriangle className="size-3.5 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {/* Accounts Table */}
        <div className="space-y-2">
          <div className="text-xs font-semibold text-foreground">
            Account pool status
          </div>

          <div className="rounded-lg border border-border bg-surface overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Remaining</TableHead>
                  <TableHead>Last synced</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {accounts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-6 text-xs text-muted-foreground">
                      No accounts found in local database.
                    </TableCell>
                  </TableRow>
                ) : (
                  accounts.map((acc) => {
                    const rem = acc.remaining ?? 0;
                    const isSyncingThis = syncingAccountId === acc.accountId;

                    return (
                      <TableRow key={acc.accountId}>
                        <TableCell className="font-medium">
                          <div className="truncate">
                            <span className="text-xs text-foreground block font-medium truncate">
                              {acc.profileName}
                            </span>
                            <span className="text-[11px] font-mono text-muted-foreground">
                              {acc.accountId}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs text-foreground font-semibold">
                          {rem.toLocaleString()}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {formatDate(acc.checkedAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={isSyncingThis || isSyncingAll}
                            onClick={() => handleSyncSingle(acc.accountId)}
                            className="h-7 px-2 text-xs"
                          >
                            <RefreshCw className={`size-3 ${isSyncingThis ? 'animate-spin' : ''}`} />
                            <span className="sr-only">Refresh</span>
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
