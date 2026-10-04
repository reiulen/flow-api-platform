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
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Play,
  Search,
  RefreshCw,
  Copy,
  Check
} from 'lucide-react';
import type { Job } from '@/lib/api';

interface JobsQueueProps {
  jobs: Job[];
  onRefresh?: () => void;
}

export const JobsQueue: React.FC<JobsQueueProps> = ({ jobs, onRefresh }) => {
  const [filterState, setFilterState] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filteredJobs = jobs.filter((j) => {
    if (filterState !== 'all' && j.state !== filterState) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const p = (j.request?.productName || j.request?.prompt || j.request?.prompts?.join(' ') || '').toLowerCase();
      return j.id.toLowerCase().includes(q) || p.includes(q);
    }
    return true;
  });

  const handleCopyId = (id: string) => {
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Job queue
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Monitor video rendering and processing tasks.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onRefresh && (
            <Button size="sm" variant="outline" className="text-xs gap-1.5" onClick={onRefresh}>
              <RefreshCw className="size-3.5" />
              <span>Refresh</span>
            </Button>
          )}
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['all', 'running', 'completed', 'failed'] as const).map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setFilterState(st)}
              className={`h-7 px-2.5 rounded-md text-xs font-medium border transition-colors capitalize cursor-pointer shrink-0 ${
                filterState === st
                  ? 'border-primary bg-primary text-primary-foreground'
                  : 'border-border bg-background text-muted-foreground hover:text-foreground hover:bg-surface-hover'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <div className="w-full sm:w-64 relative">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Search job ID or prompt..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 h-8 text-xs font-sans"
          />
        </div>
      </div>

      {/* Main Table */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[140px]">Job ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Description / Prompt</TableHead>
              <TableHead className="text-right">Duration</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Created</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredJobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-8 text-muted-foreground text-xs">
                  No jobs found matching current filters.
                </TableCell>
              </TableRow>
            ) : (
              filteredJobs.map((job) => {
                const mediaUrl = job.result?.masterUrl || job.result?.url || job.result?.downloadUrl;
                const dur = job.result?.totalDuration || job.request?.targetDuration || job.request?.duration;

                return (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs font-medium text-foreground">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate">{job.id.slice(0, 14)}...</span>
                        <button
                          type="button"
                          onClick={() => handleCopyId(job.id)}
                          className="text-muted-foreground hover:text-foreground cursor-pointer"
                          title="Copy job ID"
                        >
                          {copiedId === job.id ? (
                            <Check className="size-3 text-emerald-600" />
                          ) : (
                            <Copy className="size-3" />
                          )}
                        </button>
                      </div>
                    </TableCell>

                    <TableCell className="text-xs">
                      <span className="font-mono text-[11px] px-1.5 py-0.5 rounded-xs border border-border bg-surface-subtle text-foreground">
                        {job.type}
                      </span>
                    </TableCell>

                    <TableCell className="max-w-[280px]">
                      <p className="text-xs text-muted-foreground truncate" title={job.request?.productName || job.request?.prompt}>
                        {job.request?.productName || job.request?.prompt || 'No description provided'}
                      </p>
                    </TableCell>

                    <TableCell className="text-right font-mono text-xs text-foreground">
                      {dur ? `${dur}s` : '-'}
                    </TableCell>

                    <TableCell>
                      <Badge
                        variant={
                          job.state === 'completed'
                            ? 'success'
                            : job.state === 'running'
                              ? 'info'
                              : job.state === 'failed'
                                ? 'destructive'
                                : 'secondary'
                        }
                        className="text-[11px] gap-1"
                      >
                        {job.state === 'running' && <Loader2 className="size-3 animate-spin" />}
                        <span>{job.state}</span>
                      </Badge>
                    </TableCell>

                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {new Date(job.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </TableCell>

                    <TableCell className="text-right">
                      {mediaUrl ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs gap-1"
                          onClick={() => window.open(mediaUrl, '_blank')}
                        >
                          <Play className="size-3 fill-current" />
                          <span>Play</span>
                        </Button>
                      ) : job.error ? (
                        <span className="text-[11px] text-destructive truncate block max-w-[140px] text-right" title={job.error.message}>
                          {job.error.message}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
