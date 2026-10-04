import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Copy, Check } from 'lucide-react';
import { api } from '@/lib/api';

interface ApiKeyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ApiKeyDialog: React.FC<ApiKeyDialogProps> = ({ open, onOpenChange }) => {
  const [apiKeyInput, setApiKeyInput] = useState(api.getApiKey());
  const [isCopied, setIsCopied] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const handleSaveKey = () => {
    api.setApiKey(apiKeyInput);
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2000);
  };

  const handleCopyKey = () => {
    navigator.clipboard.writeText(apiKeyInput);
    setIsCopied(true);
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            API key configuration
          </DialogTitle>
          <DialogDescription>
            Bearer token used by this application to authenticate requests to the Flow platform API (port 8787).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">
              Bearer token value
            </label>
            <div className="flex gap-2">
              <Input
                value={apiKeyInput}
                onChange={(e) => setApiKeyInput(e.target.value)}
                className="font-mono text-xs"
                placeholder="Enter API key..."
              />
              <Button
                size="sm"
                variant="outline"
                className="h-9 px-2.5 shrink-0"
                onClick={handleCopyKey}
                title="Copy token"
              >
                {isCopied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              </Button>
            </div>
          </div>

          <div className="p-3 bg-surface-subtle border border-border rounded-md text-xs space-y-1.5 text-muted-foreground">
            <div className="flex justify-between">
              <span>Environment key:</span>
              <span className="font-mono text-foreground font-medium">FLOW_API_KEY</span>
            </div>
            <div className="flex justify-between">
              <span>Authorization header:</span>
              <span className="font-mono text-foreground font-medium">Bearer {apiKeyInput.slice(0, 8)}...</span>
            </div>
          </div>
        </div>

        <DialogFooter className="flex justify-between items-center sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => {
              const defaultKey = import.meta.env.VITE_FLOW_API_KEY || '6107412d0c24d8144d7cdb847c340e19';
              setApiKeyInput(defaultKey);
              api.setApiKey(defaultKey);
            }}
          >
            Reset to default
          </Button>
          <Button size="sm" className="text-xs" onClick={handleSaveKey}>
            {isSaved ? <Check className="size-3.5 mr-1 text-emerald-400" /> : null}
            <span>{isSaved ? 'Saved' : 'Save key'}</span>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
