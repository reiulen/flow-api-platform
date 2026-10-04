export interface Job {
  id: string;
  type: 'image' | 'video' | 'video_chain' | 'video_upscale';
  state: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  accountId?: string;
  request: any;
  result?: any;
  error?: { code: string; message: string };
  progress?: number;
  checkpoint?: {
    completedSegments?: number;
    [key: string]: any;
  };
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
}

export interface Account {
  id: string;
  label: string;
  email?: string;
  profileName: string;
  projectId?: string;
  priority: number;
  status: 'ready' | 'paused' | 'action_required' | 'exhausted';
  creditsRemaining?: number | null;
  creditsCheckedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AccountCreditDetail {
  accountId: string;
  label: string;
  profileName: string;
  status: string;
  remaining: number | null;
  checkedAt: string | null;
  error?: string;
}

export interface CreditsSummary {
  data: AccountCreditDetail[];
  totalCreditsRemaining: number;
  accountCount: number;
  cached: boolean;
}

export interface AccountCredits {
  accountId: string;
  remainingCredits: number | null;
  timestamp: string;
}

export interface PlatformStats {
  jobs: {
    total: number;
    queued: number;
    running: number;
    completed: number;
    failed: number;
  };
  accounts: {
    total: number;
    ready: number;
    paused: number;
    actionRequired: number;
  };
}

const DEFAULT_API_KEY = import.meta.env.VITE_FLOW_API_KEY || '6107412d0c24d8144d7cdb847c340e19';

export function getApiKey(): string {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem('flow_api_key');
    if (saved) return saved.trim();
  }
  return DEFAULT_API_KEY;
}

export function setApiKey(key: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem('flow_api_key', key.trim());
  }
}

async function authFetch(url: string, options: RequestInit = {}, timeoutMs = 30000): Promise<Response> {
  const token = getApiKey();
  const headers = new Headers(options.headers || {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, headers, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}


export const api = {
  getApiKey,
  setApiKey,

  async getStats(): Promise<PlatformStats> {
    try {
      const res = await authFetch('/v1/stats');
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
    } catch {}
    return {
      jobs: { total: 0, queued: 0, running: 0, completed: 0, failed: 0 },
      accounts: { total: 0, ready: 0, paused: 0, actionRequired: 0 },
    };
  },

  async getJobs(limit = 30): Promise<Job[]> {
    try {
      const res = await authFetch(`/v1/jobs?limit=${limit}`);
      if (res.ok) {
        const json = await res.json();
        return json.data || [];
      }
    } catch {}
    return [];
  },

  async getJob(id: string): Promise<Job | null> {
    try {
      const res = await authFetch(`/v1/jobs/${id}`);
      if (res.ok) {
        const json = await res.json();
        return json.data;
      }
    } catch {}
    return null;
  },

  async getAccounts(): Promise<Account[]> {
    try {
      const res = await authFetch('/v1/accounts');
      if (res.ok) {
        const json = await res.json();
        return json.data || [];
      }
    } catch {}
    return [];
  },

  async getCredits(): Promise<CreditsSummary> {
    try {
      const res = await authFetch('/v1/credits');
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return { data: [], totalCreditsRemaining: 0, accountCount: 0, cached: true };
  },

  async refreshCredits(accountId?: string): Promise<CreditsSummary | { data: AccountCreditDetail }> {
    const url = accountId ? `/v1/credits/refresh?accountId=${encodeURIComponent(accountId)}` : '/v1/credits/refresh';
    const res = await authFetch(url, { method: 'POST' });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(json.error?.message || 'Gagal menyinkronkan kredit dari Flow');
    }
    return json;
  },

  async getAccountCredits(id: string): Promise<number | null> {
    try {
      const res = await authFetch(`/v1/credits?accountId=${encodeURIComponent(id)}`);
      if (res.ok) {
        const json = await res.json();
        return json.data?.remaining ?? null;
      }
    } catch {}
    return null;
  },

  async createVideo(params: {
    prompt: string;
    model?: string;
    duration?: number;
    resolution?: string;
    aspectRatio?: string;
    mode?: string;
    count?: number;
  }): Promise<Job> {
    const res = await authFetch('/v1/videos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Gagal membuat video');
    return json.data;
  },

  async createVideoChain(params: {
    prompt?: string;
    prompts?: string[];
    targetDuration?: number;
    segmentDuration?: number;
    aspectRatio?: string;
    resolution?: string;
    model?: string;
    transition?: 'cut' | 'crossfade';
  }): Promise<Job> {
    const res = await authFetch('/v1/videos/chain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Gagal membuat rantai video');
    return json.data;
  },

  async createImage(params: {
    prompt: string;
    model?: string;
    aspectRatio?: string;
    count?: number;
    references?: string[];
  }): Promise<Job> {
    const res = await authFetch('/v1/images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Gagal membuat gambar');
    return json.data;
  },

  async createUgc(params: {
    productName: string;
    description?: string;
    targetDuration?: number;
    style?: string;
    productImage?: string;
  }): Promise<any> {
    const res = await authFetch('/v1/ugc/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Gagal membuat UGC video');
    return json.data;
  },

  async generateHooks(params: {
    productName: string;
    description?: string;
    count?: number;
    autoQueueJobs?: boolean;
    productImage?: string;
  }): Promise<any> {
    const res = await authFetch('/v1/hooks/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Gagal membuat variasi hook');
    return json.data;
  },

  async createFashion(params: {
    outfitName: string;
    description?: string;
    modelType?: 'hijab' | 'female_casual' | 'male_streetwear';
    setting?: 'aesthetic_studio' | 'outdoor_sunlit' | 'minimalist_runway';
    targetDuration?: number;
    clothingImage?: string;
  }): Promise<any> {
    const res = await authFetch('/v1/fashion/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Gagal membuat fashion video');
    return json.data;
  },

  async createKinetic(params: {
    topic: string;
    description?: string;
    targetDuration?: number;
    startImage?: string;
  }): Promise<any> {
    const res = await authFetch('/v1/kinetic/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Gagal membuat kinetic collage video');
    return json.data;
  },

  async scrapeProduct(url: string): Promise<{
    platform: 'shopee' | 'tiktok' | 'general';
    title: string;
    description: string;
    price: string;
    rating: string;
    soldCount: string;
    images: string[];
    reviewImages: string[];
    sourceUrl?: string;
    shopName?: string;
    videoUrl?: string;
  }> {
    const res = await authFetch('/v1/affiliate/scrape', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
    }, 60000);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Gagal mengambil data produk');
    return json.data;
  },

  async createAffiliateVideo(params: {
    productName: string;
    description?: string;
    productImages?: string[];
    startFrame?: string | null;
    referenceFrames?: string[];
    audience?: string;
    niche?: string;
    hook?: string;
    style?: string;
    duration?: number;
    aspectRatio?: string;
    character?: any;
    voiceover?: any;
    cta?: any;
    commerceFacts?: any;
    storyboard?: any;
    planningProvider?: '9router';
    planningModel?: string;
  }): Promise<{
    status: string;
    jobId: string;
    reused: boolean;
    targetDuration: number;
    aspectRatio: string;
    videoUrl: string;
    masterUrl?: string;
    clipFrames: Array<{
      clipNumber: number;
      timeCode: string;
      title: string;
      durationSeconds: number;
      prompt: string;
      scriptCue: string;
      visualCue: string;
      thumbnailUrl: string;
    }>;
    copywriting: {
      primaryHook?: string;
      caption: string;
      hashtags: string[];
      usps: string[];
      pinnedComment?: string;
    };
    hookAlternatives?: string[];
    job: any;
  }> {
    const res = await authFetch('/v1/affiliate/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    }, 60000);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Gagal memproses Google Flow affiliate generation');
    return json.data;
  },

  async planAffiliateVideo(params: {
    productName: string;
    description?: string;
    productImages?: string[];
    audience?: string;
    niche?: string;
    hook?: string;
    style?: string;
    duration: 10 | 14 | 18 | 20 | 24 | 26 | 30;
    aspectRatio?: string;
    character?: any;
    voiceover?: any;
    cta?: any;
    commerceFacts?: any;
    variationNote?: string;
  }, onProgress?: (msg: string) => void): Promise<{
    storyboard: any;
    framePrompts: string[];
    timeline: { duration: number; segmentDurations: number[]; shotCount: number };
    planningProvider: '9router';
    planningModel: string;
  }> {
    const token = getApiKey();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch('/v1/affiliate/plan?stream=true', {
      method: 'POST',
      headers,
      body: JSON.stringify(params),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(errJson.error?.message || `Gagal menyusun storyboard (HTTP ${res.status})`);
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream')) {
      const json = await res.json();
      return json.data;
    }

    const reader = res.body?.getReader();
    if (!reader) throw new Error('Streaming tidak didukung pada browser ini');

    const decoder = new TextDecoder();
    let buffer = '';
    let resultData: any = null;
    let streamError: any = null;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop() || '';

      for (const part of parts) {
        const lines = part.split('\n');
        let eventType = 'message';
        let dataStr = '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith(':')) {
            // Heartbeat comment, connection kept alive
            continue;
          }
          if (trimmed.startsWith('event:')) {
            eventType = trimmed.slice(6).trim();
          } else if (trimmed.startsWith('data:')) {
            dataStr = trimmed.slice(5).trim();
          }
        }

        if (!dataStr) continue;

        try {
          const payload = JSON.parse(dataStr);
          if (eventType === 'status' || eventType === 'progress') {
            if (payload.message) onProgress?.(payload.message);
          } else if (eventType === 'complete') {
            resultData = payload.data;
          } else if (eventType === 'error') {
            streamError = new Error(payload.error?.message || 'Gagal saat streaming storyboard');
          }
        } catch {
          // ignore chunk parse failure
        }
      }
    }

    if (streamError) throw streamError;
    if (!resultData) throw new Error('Respons streaming selesai tanpa data storyboard');
    return resultData;
  },

  async rerollAffiliateClip(params: {
    clipNumber: number;
    productName: string;
    description?: string;
    hook?: string;
    style?: string;
    duration?: number;
    aspectRatio?: string;
    character?: any;
    voiceover?: any;
    cta?: any;
  }): Promise<{
    clipNumber: number;
    title: string;
    scriptCue: string;
    visualCue: string;
    prompt: string;
  }> {
    const res = await authFetch('/v1/affiliate/reroll-clip', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error?.message || 'Gagal me-reroll klip');
    return json.data;
  },
};
