// Crawl4AI가 실제 브라우저로 펼쳐 읽은 공개 페이지의 범용 관측 서가.
// YouTube 공개 페이지와 앞으로 추가할 공개 사이트가 여기에 들어간다.
// @byeoli_log는 Meta 공식 API 전용, Threads 외부 계정은 소유권을 고정한 _radio-toon 전용이다.

export const WEB_OBSERVATIONS_KEY = 'radio:web-observations:v1';
export const WEB_OBSERVATIONS_RECEIPT_KEY = 'radio:web-observations:receipt';
export const WEB_OBSERVATIONS_SOURCE_MAX = 12;
export const WEB_OBSERVATIONS_ITEM_MAX = 10;
export const WEB_OBSERVATIONS_CRAWL_MAX_AGE_MS = 30 * 60_000;

export type WebObservationKind = 'youtube_channel' | 'web_page';

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
  engine: 'crawl4ai';
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

export function validateWebObservation(raw: unknown, now = Date.now(), enforceFresh = true): WebObservationValidation {
  const input = raw as Partial<WebObservationSource> | null;
  if (!input || input.engine !== 'crawl4ai') return { ok: false, error: 'engine_must_be_crawl4ai' };
  if (input.ownership !== 'read_only') return { ok: false, error: 'ownership_must_be_read_only' };
  const id = compact(input.id);
  if (!/^[a-z0-9][a-z0-9-]{2,47}$/.test(id)) return { ok: false, error: 'source_id_invalid' };
  const label = compact(input.label);
  if (!label || label.length > 100) return { ok: false, error: 'source_label_invalid' };
  if (input.kind !== 'youtube_channel' && input.kind !== 'web_page') return { ok: false, error: 'source_kind_invalid' };
  const sourceUrl = publicHttpsUrl(input.sourceUrl);
  if (!sourceUrl) return { ok: false, error: 'source_url_invalid' };
  // Threads는 계정 소유권 혼선을 막기 위해 범용 서가에 넣지 않는다.
  // @byeoli_log는 공식 Meta API, @byeol.toon은 전용 읽기 서가만 쓴다.
  if (isThreadsUrl(sourceUrl)) return { ok: false, error: 'threads_requires_owned_or_external_dedicated_path' };

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
    source: { id, label, kind: input.kind, sourceUrl, fetchedAt, engine: 'crawl4ai', ownership: 'read_only', items },
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
