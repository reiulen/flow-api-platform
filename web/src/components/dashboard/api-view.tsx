import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  KeyRound,
  Copy,
  Check,
  ExternalLink,
  Code2,
  Eye,
  EyeOff
} from 'lucide-react';
import { api } from '@/lib/api';

export const ApiView: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [activeTab, setActiveTab] = useState<'ugc' | 'hooks' | 'fashion' | 'kinetic' | 'credits'>('ugc');
  const [activeLang, setActiveLang] = useState<'curl' | 'node' | 'python'>('curl');

  const apiKey = api.getApiKey();

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    if (id === 'key') {
      setCopiedKey(true);
      setTimeout(() => setCopiedKey(false), 2000);
    } else {
      setCopiedSnippet(id);
      setTimeout(() => setCopiedSnippet(null), 2000);
    }
  };

  const endpoints = {
    ugc: {
      title: 'UGC Video Generator',
      method: 'POST',
      path: '/v1/ugc/generate',
      status: '202 Accepted',
      desc: 'Generates a vertical UGC promotional video with product USP hook and voiceover.',
      curl: `curl -X POST http://127.0.0.1:8787/v1/ugc/generate \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "productName": "Glowing Barrier Serum",
    "description": "Ceramide barrier repair serum for TikTok affiliate",
    "targetDuration": 18,
    "aspectRatio": "9:16"
  }'`,
      node: `import fetch from 'node-fetch';

const res = await fetch('http://127.0.0.1:8787/v1/ugc/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    productName: 'Glowing Barrier Serum',
    description: 'Ceramide barrier repair serum for TikTok affiliate',
    targetDuration: 18,
    aspectRatio: '9:16'
  })
});

const { data } = await res.json();
console.log('Job queued:', data.jobId);`,
      python: `import requests

url = "http://127.0.0.1:8787/v1/ugc/generate"
headers = {
    "Authorization": "Bearer ${apiKey}",
    "Content-Type": "application/json"
}
payload = {
    "productName": "Glowing Barrier Serum",
    "description": "Ceramide barrier repair serum for TikTok affiliate",
    "targetDuration": 18,
    "aspectRatio": "9:16"
}

response = requests.post(url, json=payload, headers=headers)
print(response.json())`,
      response: `{
  "success": true,
  "data": {
    "jobId": "job_ugc_9f82c401",
    "status": "queued",
    "targetDuration": 18,
    "aspectRatio": "9:16",
    "estimatedCredits": 20
  }
}`
    },
    hooks: {
      title: '10x Hook Generator',
      method: 'POST',
      path: '/v1/hooks/generate',
      status: '200 OK',
      desc: 'Synthesizes high-converting opening hooks tailored to viral short video formats.',
      curl: `curl -X POST http://127.0.0.1:8787/v1/hooks/generate \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "productName": "Glowing Barrier Serum",
    "description": "Kulit kusam cerah dalam 7 hari",
    "count": 5
  }'`,
      node: `const res = await fetch('http://127.0.0.1:8787/v1/hooks/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    productName: 'Glowing Barrier Serum',
    description: 'Kulit kusam cerah dalam 7 hari',
    count: 5
  })
});

const { data } = await res.json();
console.log(data.hooks);`,
      python: `import requests

res = requests.post(
    "http://127.0.0.1:8787/v1/hooks/generate",
    headers={"Authorization": "Bearer ${apiKey}"},
    json={"productName": "Glowing Barrier Serum", "count": 5}
)
print(res.json()["data"]["hooks"])`,
      response: `{
  "success": true,
  "data": {
    "count": 5,
    "hooks": [
      "Aku nyesel banget baru tahu produk ini sekarang...",
      "Stop scroll! Ini produk yang lagi diskon 50% di keranjang kuning!",
      "Capek punya kulit kusam berulang kali? Rahasianya ada di sini...",
      "Mari kita uji beneran apakah se-worth it itu?",
      "Unboxing produk viral yang bikin candu..."
    ]
  }
}`
    },
    fashion: {
      title: 'Virtual Fashion Studio',
      method: 'POST',
      path: '/v1/fashion/generate',
      status: '202 Accepted',
      desc: 'Renders dynamic 360-degree garment showcases with tailored aesthetic backgrounds.',
      curl: `curl -X POST http://127.0.0.1:8787/v1/fashion/generate \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "outfitName": "Gamis Silk Sage Green",
    "modelType": "hijab",
    "setting": "aesthetic_studio",
    "targetDuration": 20
  }'`,
      node: `const res = await fetch('http://127.0.0.1:8787/v1/fashion/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    outfitName: 'Gamis Silk Sage Green',
    modelType: 'hijab',
    setting: 'aesthetic_studio',
    targetDuration: 20
  })
});`,
      python: `import requests

res = requests.post(
    "http://127.0.0.1:8787/v1/fashion/generate",
    headers={"Authorization": "Bearer ${apiKey}"},
    json={
        "outfitName": "Gamis Silk Sage Green",
        "modelType": "hijab",
        "setting": "aesthetic_studio",
        "targetDuration": 20
    }
)`,
      response: `{
  "success": true,
  "data": {
    "jobId": "job_fsh_7b19a3d4",
    "status": "processing",
    "modelType": "hijab",
    "duration": 20
  }
}`
    },
    kinetic: {
      title: 'Kinetic Explainer Factory',
      method: 'POST',
      path: '/v1/kinetic/generate',
      status: '202 Accepted',
      desc: 'Produces documentary-grade mixed-media collage motion videos with Google Veo and HyperFrames.',
      curl: `curl -X POST http://127.0.0.1:8787/v1/kinetic/generate \\
  -H "Authorization: Bearer ${apiKey}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "topic": "The Global Semiconductor Supply Chain",
    "description": "How advanced lithography machines are manufactured",
    "targetDuration": 30
  }'`,
      node: `const res = await fetch('http://127.0.0.1:8787/v1/kinetic/generate', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ${apiKey}',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    topic: 'The Global Semiconductor Supply Chain',
    targetDuration: 30
  })
});`,
      python: `import requests

res = requests.post(
    "http://127.0.0.1:8787/v1/kinetic/generate",
    headers={"Authorization": "Bearer ${apiKey}"},
    json={"topic": "The Global Semiconductor Supply Chain", "targetDuration": 30}
)`,
      response: `{
  "success": true,
  "data": {
    "jobId": "job_kin_52d8e09f",
    "status": "queued",
    "duration": 30,
    "engine": "veo-hyperframes"
  }
}`
    },
    credits: {
      title: 'Credit Pool Balance',
      method: 'GET',
      path: '/v1/credits',
      status: '200 OK',
      desc: 'Returns quota telemetry and credit breakdown across all connected Google Flow accounts.',
      curl: `curl -X GET http://127.0.0.1:8787/v1/credits \\
  -H "Authorization: Bearer ${apiKey}"`,
      node: `const res = await fetch('http://127.0.0.1:8787/v1/credits', {
  headers: { 'Authorization': 'Bearer ${apiKey}' }
});
const data = await res.json();
console.log('Total remaining:', data.totalCreditsRemaining);`,
      python: `import requests

res = requests.get(
    "http://127.0.0.1:8787/v1/credits",
    headers={"Authorization": "Bearer ${apiKey}"}
)
print(res.json()["totalCreditsRemaining"])`,
      response: `{
  "totalCreditsRemaining": 780,
  "accountsCount": 5,
  "activeAccounts": 5,
  "accounts": [
    { "id": "acc-1", "name": "Flow Alpha", "creditsRemaining": 200, "status": "active" },
    { "id": "acc-2", "name": "Flow Beta", "creditsRemaining": 180, "status": "active" }
  ]
}`
    }
  };

  const currentEndpoint = endpoints[activeTab];
  const activeCodeSnippet = currentEndpoint[activeLang];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="pb-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-semibold tracking-tight text-foreground">
            Developer API
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            REST API for video generation, templates, and account management.
          </p>
        </div>
        <a
          href="http://127.0.0.1:8787/docs"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-background text-xs font-medium text-foreground hover:bg-surface-hover transition-colors"
        >
          <ExternalLink className="size-3.5 opacity-70" />
          <span>Interactive docs (/docs)</span>
        </a>
      </div>

      {/* Authentication Token Card */}
      <div className="rounded-lg border border-border bg-surface p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <KeyRound className="size-4 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Bearer API token</span>
          </div>
          <span className="text-[11px] text-muted-foreground">Header: Authorization</span>
        </div>

        <p className="text-xs text-muted-foreground">
          Authenticate requests by providing this bearer token in your HTTP Authorization header.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <div className="flex-1 flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-code-bg font-mono text-xs">
            <span className="text-muted-foreground select-none">Bearer</span>
            <span className="truncate flex-1 text-foreground">
              {showKey ? apiKey : `${apiKey.slice(0, 8)}••••••••••••••••••••••••`}
            </span>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowKey(!showKey)}
            className="h-8 px-2.5 text-xs"
          >
            {showKey ? <EyeOff className="size-3.5 mr-1" /> : <Eye className="size-3.5 mr-1" />}
            <span>{showKey ? 'Hide' : 'Reveal'}</span>
          </Button>

          <Button
            variant="secondary"
            size="sm"
            onClick={() => handleCopy(apiKey, 'key')}
            className="h-8 px-2.5 text-xs"
          >
            {copiedKey ? <Check className="size-3.5 mr-1 text-emerald-600" /> : <Copy className="size-3.5 mr-1" />}
            <span>{copiedKey ? 'Copied' : 'Copy token'}</span>
          </Button>
        </div>
      </div>

      {/* Endpoint Explorer */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden">
        {/* Endpoint Selector Tabs */}
        <div className="flex items-center border-b border-border bg-surface-subtle overflow-x-auto px-2">
          {(Object.keys(endpoints) as (keyof typeof endpoints)[]).map((key) => {
            const ep = endpoints[key];
            const isActive = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium border-b-2 -mb-[1px] transition-colors whitespace-nowrap cursor-pointer ${
                  isActive
                    ? 'border-foreground text-foreground bg-surface'
                    : 'border-transparent text-muted-foreground hover:text-foreground'
                }`}
              >
                <span className={`text-[10px] font-mono px-1 py-0.2 rounded-xs border ${
                  ep.method === 'POST' ? 'border-border bg-background text-foreground' : 'border-border bg-background text-muted-foreground'
                }`}>
                  {ep.method}
                </span>
                <span>{ep.title}</span>
              </button>
            );
          })}
        </div>

        {/* Selected Endpoint Body */}
        <div className="p-4 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-border">
            <div className="flex items-center gap-2 font-mono text-xs">
              <span className="font-bold text-foreground">{currentEndpoint.method}</span>
              <span className="text-muted-foreground">{currentEndpoint.path}</span>
            </div>
            <span className="text-[11px] font-mono text-muted-foreground">
              Response: {currentEndpoint.status}
            </span>
          </div>

          <p className="text-xs text-muted-foreground">
            {currentEndpoint.desc}
          </p>

          {/* Code Tabs Header */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="inline-flex h-7 items-center rounded-md bg-muted/50 p-0.5 border border-border">
                {(['curl', 'node', 'python'] as const).map((lang) => (
                  <button
                    key={lang}
                    type="button"
                    onClick={() => setActiveLang(lang)}
                    className={`px-2.5 py-0.5 rounded-xs text-[11px] font-mono transition-colors cursor-pointer ${
                      activeLang === lang
                        ? 'bg-background text-foreground border border-border'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {lang === 'curl' ? 'cURL' : lang === 'node' ? 'Node.js' : 'Python'}
                  </button>
                ))}
              </div>

              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => handleCopy(activeCodeSnippet, 'code')}
              >
                {copiedSnippet === 'code' ? (
                  <Check className="size-3 mr-1 text-emerald-600" />
                ) : (
                  <Copy className="size-3 mr-1" />
                )}
                <span>{copiedSnippet === 'code' ? 'Copied' : 'Copy snippet'}</span>
              </Button>
            </div>

            {/* Request Code Block */}
            <div className="rounded-md border border-border bg-code-bg p-3.5 font-mono text-xs text-foreground overflow-x-auto leading-relaxed">
              <pre>{activeCodeSnippet}</pre>
            </div>
          </div>

          {/* Response Payload */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-medium text-foreground">Sample response payload</span>
              <span className="font-mono text-muted-foreground">application/json</span>
            </div>
            <div className="rounded-md border border-border bg-code-bg p-3.5 font-mono text-xs text-foreground overflow-x-auto leading-relaxed">
              <pre>{currentEndpoint.response}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
