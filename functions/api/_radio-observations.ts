// 별이가 읽기 전용 통로로 받아 보는 범용 감각 재료 서가.
// 브라우저로 펼친 공개 페이지뿐 아니라, 출처가 분명한 공개 API와 우리 사진 인덱스도 들어간다.
// @byeoli_log는 Meta 공식 API 전용, Threads 외부 계정은 소유권을 고정한 _radio-toon 전용이다.

export const WEB_OBSERVATIONS_KEY = 'radio:web-observations:v1';
export const WEB_OBSERVATIONS_RECEIPT_KEY = 'radio:web-observations:receipt';
export const WEB_OBSERVATIONS_RECEIPTS_KEY = 'radio:web-observations:receipts:v1';
export const WEB_OBSERVATIONS_SOURCE_MAX = 12;
export const WEB_OBSERVATIONS_ITEM_MAX = 10;
export const WEB_OBSERVATIONS_CRAWL_MAX_AGE_MS = 30 * 60_000;

export type WebObservationKind =
  | 'youtube_channel'
  | 'web_page'
  | 'sky_data'
  | 'image_library'
  | 'art_collection'
  | 'wikisource';

export type WebObservationEngine =
  | 'crawl4ai'
  | 'sunrise-sunset-api'
  | 'local-image-index'
  | 'artic-api'
  | 'mediawiki-api';

export interface WebObservationItem {
  id: string;
  title: string;
  text: string;
  when: string;
  url: string;
}

export interface WebObservationSource {
  id: string;
  label: string;
  kind: WebObservationKind;
  sourceUrl: string;
  fetchedAt: number;
  engine: WebObservationEngine;
  ownership: 'read_only';
  items: WebObservationItem[];
}

export interface WebObservationShelf {
  version: 'web-observations-v1';
  updatedAt: number;
  sources: WebObservationSource[];
}

export type WebObservationValidation =
  | { ok: true; source: WebObservationSource }
  | { ok: false; error: string };

export interface WebObservationReceipt {
  at: number;
  ok: boolean;
  sourceId: string;
  label: string;
  kind: WebObservationKind;
  sourceUrl: string;
  engine: WebObservationEngine;
  ownership: 'read_only';
  fetchedAt: number;
  count: number;
  error: string | null;
}

export interface WebObservationReceiptShelf {
  version: 'web-observation-receipts-v1';
  updatedAt: number;
  receipts: WebObservationReceipt[];
}

export type WebObservationReceiptValidation =
  | { ok: true; receipt: WebObservationReceipt }
  | { ok: false; error: string };

const compact = (value: unknown): string => String(value ?? '').replace(/\s+/g, ' ').trim();

function publicHttpsUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? ''));
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || !host || host === 'localhost' || host.endsWith('.local')) return null;
    if (/^(127\.|10\.|192\.168\.|169\.254\.)/.test(host)) return null;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return null;
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function isThreadsUrl(value: string): boolean {
  try { return new URL(value).hostname.toLowerCase().replace(/^www\./, '') === 'threads.com'; }
  catch { return false; }
}

const KIND_ENGINES: Record<WebObservationKind, readonly WebObservationEngine[]> = {
  youtube_channel: ['crawl4ai'],
  web_page: ['crawl4ai'],
  sky_data: ['sunrise-sunset-api'],
  image_library: ['local-image-index'],
  art_collection: ['artic-api'],
  wikisource: ['mediawiki-api', 'crawl4ai'],
};

type SourceIdentity = Pick<
  WebObservationSource,
  'id' | 'label' | 'kind' | 'sourceUrl' | 'engine' | 'ownership'
>;

function validateSourceIdentity(raw: unknown): { ok: true; identity: SourceIdentity } | { ok: false; error: string } {
  const input = raw as Partial<WebObservationSource> | null;
  if (!input || input.ownership !== 'read_only') return { ok: false, error: 'ownership_must_be_read_only' };
  const id = compact(input.id);
  if (!/^[a-z0-9][a-z0-9-]{2,47}$/.test(id)) return { ok: false, error: 'source_id_invalid' };
  const label = compact(input.label);
  if (!label || label.length > 100) return { ok: false, error: 'source_label_invalid' };
  const kind = input.kind as WebObservationKind;
  const engine = input.engine as WebObservationEngine;
  if (!KIND_ENGINES[kind]) return { ok: false, error: 'source_kind_invalid' };
  if (!(KIND_ENGINES[kind] as readonly WebObservationEngine[]).includes(engine)) {
    return { ok: false, error: 'source_engine_mismatch' };
  }
  const sourceUrl = publicHttpsUrl(input.sourceUrl);
  if (!sourceUrl) return { ok: false, error: 'source_url_invalid' };
  // Threads는 계정 소유권 혼선을 막기 위해 범용 서가에 넣지 않는다.
  // @byeoli_log는 공식 Meta API, @byeol.toon은 전용 읽기 서가만 쓴다.
  if (isThreadsUrl(sourceUrl)) return { ok: false, error: 'threads_requires_owned_or_external_dedicated_path' };
  return { ok: true, identity: { id, label, kind, sourceUrl, engine, ownership: 'read_only' } };
}

export function validateWebObservation(raw: unknown, now = Date.now(), enforceFresh = true): WebObservationValidation {
  const input = raw as Partial<WebObservationSource> | null;
  const identity = validateSourceIdentity(raw);
  if (!identity.ok) return identity;

  const fetchedAt = Number(input.fetchedAt);
  if (!Number.isFinite(fetchedAt)) return { ok: false, error: 'fetched_at_invalid' };
  if (fetchedAt > now + 2 * 60_000) return { ok: false, error: 'fetched_at_in_future' };
  if (enforceFresh && now - fetchedAt > WEB_OBSERVATIONS_CRAWL_MAX_AGE_MS) {
    return { ok: false, error: 'crawl_result_stale' };
  }
  if (!Array.isArray(input.items) || input.items.length < 1) return { ok: false, error: 'items_empty' };
  if (input.items.length > WEB_OBSERVATIONS_ITEM_MAX) return { ok: false, error: 'items_too_many' };

  const seen = new Set<string>();
  const items: WebObservationItem[] = [];
  for (const value of input.items) {
    const item = value as Partial<WebObservationItem>;
    const itemId = compact(item.id);
    if (!/^[A-Za-z0-9._:-]{3,120}$/.test(itemId) || seen.has(itemId)) {
      return { ok: false, error: seen.has(itemId) ? 'item_duplicate' : 'item_id_invalid' };
    }
    const title = compact(item.title);
    const text = compact(item.text);
    const when = compact(item.when);
    const url = publicHttpsUrl(item.url);
    if ((!title && !text) || title.length > 240 || text.length > 1800) return { ok: false, error: 'item_text_invalid' };
    if (when.length > 80 || !url) return { ok: false, error: !url ? 'item_url_invalid' : 'item_when_too_long' };
    seen.add(itemId);
    items.push({ id: itemId, title, text, when, url });
  }

  return {
    ok: true,
    source: { ...identity.identity, fetchedAt, items },
  };
}

export function validateWebObservationFailureReceipt(
  raw: unknown, now = Date.now(),
): WebObservationReceiptValidation {
  const input = raw as (Partial<WebObservationSource> & {
    receiptOnly?: boolean; outcome?: string; error?: unknown;
  }) | null;
  if (!input || input.receiptOnly !== true || input.outcome !== 'failure') {
    return { ok: false, error: 'failure_receipt_contract_invalid' };
  }
  const identity = validateSourceIdentity(input);
  if (!identity.ok) return identity;
  const fetchedAt = Number(input.fetchedAt);
  if (!Number.isFinite(fetchedAt) || fetchedAt > now + 2 * 60_000) {
    return { ok: false, error: 'fetched_at_invalid' };
  }
  const error = compact(input.error).slice(0, 300);
  if (!error) return { ok: false, error: 'failure_error_missing' };
  return {
    ok: true,
    receipt: {
      at: now, ok: false, sourceId: identity.identity.id, label: identity.identity.label,
      kind: identity.identity.kind, sourceUrl: identity.identity.sourceUrl,
      engine: identity.identity.engine, ownership: 'read_only', fetchedAt, count: 0, error,
    },
  };
}

export function decodeWebObservationShelf(raw: unknown): WebObservationShelf {
  const input = raw as Partial<WebObservationShelf> | null;
  if (!input || input.version !== 'web-observations-v1' || !Array.isArray(input.sources)) {
    return { version: 'web-observations-v1', updatedAt: 0, sources: [] };
  }
  const sources: WebObservationSource[] = [];
  for (const rawSource of input.sources.slice(0, WEB_OBSERVATIONS_SOURCE_MAX)) {
    const checked = validateWebObservation(rawSource, Number((rawSource as WebObservationSource)?.fetchedAt), false);
    if (checked.ok) sources.push(checked.source);
  }
  return { version: 'web-observations-v1', updatedAt: Number(input.updatedAt) || 0, sources };
}

export function mergeWebObservation(
  shelf: WebObservationShelf, source: WebObservationSource, now = Date.now(),
): WebObservationShelf {
  const previous = shelf.sources.find((item) => item.id === source.id);
  const winner = previous && previous.fetchedAt >= source.fetchedAt ? previous : source;
  return {
    version: 'web-observations-v1',
    updatedAt: now,
    sources: [winner, ...shelf.sources.filter((item) => item.id !== source.id)]
      .sort((a, b) => b.fetchedAt - a.fetchedAt)
      .slice(0, WEB_OBSERVATIONS_SOURCE_MAX),
  };
}

export function receiptForWebObservation(
  source: WebObservationSource, now = Date.now(),
): WebObservationReceipt {
  return {
    at: now, ok: true, sourceId: source.id, label: source.label, kind: source.kind,
    sourceUrl: source.sourceUrl, engine: source.engine, ownership: 'read_only',
    fetchedAt: source.fetchedAt, count: source.items.length, error: null,
  };
}

export function decodeWebObservationReceipts(raw: unknown): WebObservationReceiptShelf {
  const input = raw as Partial<WebObservationReceiptShelf> | null;
  if (!input || input.version !== 'web-observation-receipts-v1' || !Array.isArray(input.receipts)) {
    return { version: 'web-observation-receipts-v1', updatedAt: 0, receipts: [] };
  }
  const receipts: WebObservationReceipt[] = [];
  for (const value of input.receipts.slice(0, WEB_OBSERVATIONS_SOURCE_MAX)) {
    const candidate = value as Partial<WebObservationReceipt>;
    const identity = validateSourceIdentity({ ...candidate, id: candidate.sourceId });
    const at = Number(candidate.at);
    const fetchedAt = Number(candidate.fetchedAt);
    if (!identity.ok || !Number.isFinite(at) || !Number.isFinite(fetchedAt) || typeof candidate.ok !== 'boolean') continue;
    receipts.push({
      at, ok: candidate.ok, sourceId: identity.identity.id, label: identity.identity.label,
      kind: identity.identity.kind, sourceUrl: identity.identity.sourceUrl, engine: identity.identity.engine,
      ownership: 'read_only', fetchedAt, count: Math.max(0, Number(candidate.count) || 0),
      error: candidate.ok ? null : compact(candidate.error).slice(0, 300) || 'unknown_failure',
    });
  }
  return { version: 'web-observation-receipts-v1', updatedAt: Number(input.updatedAt) || 0, receipts };
}

export function mergeWebObservationReceipt(
  shelf: WebObservationReceiptShelf, receipt: WebObservationReceipt, now = Date.now(),
): WebObservationReceiptShelf {
  const previous = shelf.receipts.find((item) => item.sourceId === receipt.sourceId);
  const winner = previous && previous.at > receipt.at ? previous : receipt;
  return {
    version: 'web-observation-receipts-v1',
    updatedAt: now,
    receipts: [winner, ...shelf.receipts.filter((item) => item.sourceId !== receipt.sourceId)]
      .sort((a, b) => b.at - a.at)
      .slice(0, WEB_OBSERVATIONS_SOURCE_MAX),
  };
}
