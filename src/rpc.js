import { AppError } from './errors.js';

export const RPC = Object.freeze({
  projects: { id: 'UpteDb', mode: 'read' }, project: { id: 'ngNC2', mode: 'read' },
  contents: { id: 'Zzl0ze', mode: 'read' }, models: { id: 'HTrJv', mode: 'read' },
  modelStatuses: { id: 'yBhWQ', mode: 'read' }, credits: { id: 'nzlxg', mode: 'read' },
  media: { id: 'as29s', mode: 'read' }, listMedia: { id: 'bOKtO', mode: 'read' },
});

function findEnvelope(value, id) {
  if (Array.isArray(value)) {
    if (value[0] === 'wrb.fr' && value[1] === id) return value;
    for (const child of value) { const found = findEnvelope(child, id); if (found) return found; }
  } else if (value && typeof value === 'object') {
    for (const child of Object.values(value)) { const found = findEnvelope(child, id); if (found) return found; }
  }
  return null;
}

export function parseBatch(text, id) {
  const docs = [];
  for (const line of text.replace(/^\)\]\}'\s*/, '').split('\n')) {
    if (!line.trim() || /^\d+$/.test(line.trim())) continue;
    try { docs.push(JSON.parse(line)); } catch {}
  }
  for (const doc of docs) {
    const envelope = findEnvelope(doc, id);
    if (envelope) {
      if (typeof envelope[2] !== 'string') return envelope[2];
      try { return JSON.parse(envelope[2]); } catch { return envelope[2]; }
    }
  }
  throw new AppError(502, 'rpc_contract_changed', 'Kontrak respons Flow berubah');
}

export async function callRpc(page, definition, payload, sourcePath = '/') {
  const response = await page.evaluate(async ({ id, payload, sourcePath }) => {
    const data = window.WIZ_global_data ?? {};
    if (!data.cfb2h || !data.FdrFJe) return { bootstrapMissing: true };
    const query = new URLSearchParams({ rpcids: id, 'source-path': sourcePath, bl: data.cfb2h,
      'f.sid': String(data.FdrFJe), hl: document.documentElement.lang || 'en',
      _reqid: String(Math.floor(Math.random() * 900000) + 100000), rt: 'c' });
    const body = new URLSearchParams({ 'f.req': JSON.stringify([[[id, JSON.stringify(payload), null, 'generic']]]) });
    if (data.SNlM0e) body.set('at', data.SNlM0e);
    const result = await fetch(`/_/AiSandboxAngularFrontend/data/batchexecute?${query}`, {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/x-www-form-urlencoded;charset=UTF-8' }, body });
    return { status: result.status, text: await result.text() };
  }, { id: definition.id, payload, sourcePath });
  if (response.bootstrapMissing) throw new AppError(503, 'rpc_bootstrap_missing', 'Bootstrap Flow tidak tersedia');
  if (response.status < 200 || response.status >= 300) throw new AppError(502, 'rpc_http_error', `Flow RPC HTTP ${response.status}`);
  return parseBatch(response.text, definition.id);
}
