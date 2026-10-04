import { AppError } from './errors.js';

const DEFAULT_BASE_URL = 'http://127.0.0.1:20128/v1';

function trimTrailingSlash(value) {
  return String(value || DEFAULT_BASE_URL).replace(/\/+$/, '');
}

function extractMessageText(message) {
  const content = message?.content;
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => typeof part === 'string' ? part : (part?.text || ''))
    .filter(Boolean)
    .join('\n');
}

function parseJsonObject(raw) {
  const text = String(raw || '').trim();
  if (!text) throw new Error('9router mengembalikan respons kosong');
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Respons 9router bukan JSON object');
    return JSON.parse(match[0]);
  }
}

function modelScore(model) {
  const id = String(model?.id || '').toLowerCase();
  const owner = String(model?.owned_by || '').toLowerCase();
  const capabilities = model?.capabilities || {};
  let score = 0;
  if (/astra/.test(id)) score += 1_000;
  else if (/sol/.test(id)) score += 850;
  else if (/codex|max/.test(id)) score += 750;
  if (owner === 'combo') score += 500;
  if (owner === 'cx' || id.startsWith('cx/')) score += 400;
  if (capabilities.vision) score += 150;
  if (capabilities.reasoning) score += 100;
  if (/review|image|mini|spark|luna/.test(id)) score -= 150;
  score += Math.min(Number(capabilities.contextWindow || model?.context_length || 0) / 100_000, 10);
  return score;
}

export class NineRouterClient {
  constructor(config = {}) {
    this.baseUrl = trimTrailingSlash(config.nineRouterBaseUrl);
    this.apiKey = String(config.nineRouterApiKey || '').trim();
    this.preferredModel = String(config.nineRouterModel || '').trim();
    this.timeoutMs = Math.max(10_000, Number(config.nineRouterTimeoutMs || 90_000));
    this.cachedModel = null;
  }

  async request(pathname, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers = new Headers(options.headers || {});
    headers.set('Content-Type', 'application/json');
    if (this.apiKey) headers.set('Authorization', `Bearer ${this.apiKey}`);

    try {
      const response = await fetch(`${this.baseUrl}${pathname}`, {
        ...options,
        headers,
        signal: controller.signal,
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const detail = body?.error?.message || body?.message || `HTTP ${response.status}`;
        if (response.status === 401 && !this.apiKey) {
          throw new AppError(503, 'nine_router_api_key_missing', '9router aktif tetapi NINE_ROUTER_API_KEY belum dikonfigurasi');
        }
        throw new AppError(502, 'nine_router_request_failed', `9router gagal: ${detail}`);
      }
      return body;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error?.name === 'AbortError') {
        throw new AppError(504, 'nine_router_timeout', '9router melewati batas waktu respons');
      }
      throw new AppError(503, 'nine_router_unavailable', `Tidak dapat menghubungi 9router di ${this.baseUrl}: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }

  async resolveModel() {
    if (this.cachedModel) return this.cachedModel;
    if (this.preferredModel) {
      this.cachedModel = this.preferredModel;
      return this.cachedModel;
    }
    const catalog = await this.request('/models', { method: 'GET' });
    const models = Array.isArray(catalog?.data) ? catalog.data : [];

    const compatible = models
      .filter((model) => model?.id && model?.capabilities?.vision !== false)
      .sort((a, b) => modelScore(b) - modelScore(a));
    if (compatible.length === 0) {
      throw new AppError(503, 'nine_router_model_unavailable', 'Tidak ada model vision/reasoning yang cocok di 9router');
    }
    this.cachedModel = compatible[0].id;
    return this.cachedModel;
  }

  async generateJson({ system, user, images = [], temperature = 0.2, maxTokens = 7000, onToken = null, onStatus = null, onReasoning = null }) {
    const model = await this.resolveModel();
    onStatus?.(`Menggunakan model 9router: ${model}`);

    const content = [{ type: 'text', text: user }];
    for (const imageUrl of images.filter(Boolean).slice(0, 8)) {
      content.push({ type: 'image_url', image_url: { url: imageUrl, detail: 'high' } });
    }

    const controller = new AbortController();
    let timeout = setTimeout(() => controller.abort(), 60_000);
    const resetTimeout = () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => controller.abort(), 60_000);
    };

    const headers = new Headers();
    headers.set('Content-Type', 'application/json');
    if (this.apiKey) headers.set('Authorization', `Bearer ${this.apiKey}`);

    try {
      const response = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content },
          ],
          temperature,
          max_tokens: maxTokens,
          stream: true,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        const detail = body?.error?.message || body?.message || `HTTP ${response.status}`;
        if (response.status === 401 && !this.apiKey) {
          throw new AppError(503, 'nine_router_api_key_missing', '9router aktif tetapi NINE_ROUTER_API_KEY belum dikonfigurasi');
        }
        throw new AppError(502, 'nine_router_request_failed', `9router gagal: ${detail}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('Streaming response body tidak didukung');

      const decoder = new TextDecoder();
      let buffer = '';
      let accumulatedText = '';

      while (true) {
        const { done, value } = await reader.read();
        resetTimeout();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;
          const dataStr = trimmed.slice(5).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const deltaContent = parsed.choices?.[0]?.delta?.content || '';
            const deltaReasoning = parsed.choices?.[0]?.delta?.reasoning_content || '';
            if (deltaReasoning) {
              onReasoning?.(deltaReasoning);
            }
            if (deltaContent) {
              accumulatedText += deltaContent;
              onToken?.(deltaContent);
            }
          } catch {}
        }
      }

      if (!accumulatedText.trim()) {
        throw new Error('9router mengembalikan respons kosong');
      }

      return { data: parseJsonObject(accumulatedText), model };
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error?.name === 'AbortError') {
        throw new AppError(504, 'nine_router_timeout', '9router melewati batas waktu respons (idle >60s)');
      }
      throw new AppError(503, 'nine_router_unavailable', `Tidak dapat menghubungi 9router di ${this.baseUrl}: ${error.message}`);
    } finally {
      clearTimeout(timeout);
    }
  }
}
