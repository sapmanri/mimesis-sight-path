// 여백섬 조립 산출물 저장 — POST /api/ops/comic-assemble (Ops 호스트 전용 · Access 뒤)
//
// 컷별 경로(renderMode:'panels')는 브라우저에서 한 장으로 조립된다. 그 결과를 여기에 올린다.
//
// 홈즈 조건 (2026-07-26 01:06): "완성 bitmap과 사용한 manifest를 R2에 함께 저장하라 —
// 그래야 같은 입력이 기기마다 달라지는 일을 막고, 나중에 Cloudflare Images나 다른 서버
// 렌더러로 옮겨도 계약을 보존할 수 있다."
//
// 핵심 설계: 조립본을 **원샷 페이지와 같은 키**(`comic/strips/<id>/page.png`)에 넣는다.
// 그러면 목록·통짜 다운로드·인스타툰 분절이 경로를 구분하지 않는다 — 조립본과 원샷본이
// 서로 갈아끼워진다. 새 경로를 만들면 그 셋을 전부 두 벌로 만들어야 한다.
//
// ⛔ 자동 게시·크론 연결 없음. 쓰는 곳은 comic/strips/ 뿐이다.

import { COMIC_STRIP_PREFIX } from './comic-generate.ts';
import { validateLayoutPlan, validatePageContext, type LayoutPlan, type PageContext } from '../_comic-layout.ts';

interface Env { CAPTURES: R2Bucket }

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });

const MAX_PAGE_BYTES = 24 * 1024 * 1024;
export const ASSEMBLY_VERSION = 'assembly-v1';

/** 조립을 재현하는 데 필요한 것 전부. 나중에 서버 렌더러로 옮겨도 이 계약이 남는다. */
export interface AssemblyManifest {
  version: typeof ASSEMBLY_VERSION;
  comicId: string;
  /** 조립기가 실제로 쓴 좌표 — 이미지 추정 크롭이 아니라 논리 셀이다 */
  layoutPlan: LayoutPlan;
  /** 컷을 한 페이지로 묶은 공통 문맥 (없을 수 있다 — planner 실패 시) */
  pageContext: PageContext | null;
  /** 컷 index → R2 키. 어느 그림이 어느 자리에 들어갔는지 */
  panelKeys: Record<string, string>;
  /** 조판에 실제로 적재된 폰트. null이면 캡션을 그리지 않았다는 뜻이다 */
  font: string | null;
  /** 조립기가 낸 경고 — 빈 자리·못 그린 캡션·넘친 문장. 숨기지 않는다 */
  warnings: string[];
  assembledAt: number;
}

export function validateManifest(x: unknown): string[] {
  const errs: string[] = [];
  if (typeof x !== 'object' || x === null) return ['manifest is not an object'];
  const m = x as Partial<AssemblyManifest>;
  if (m.version !== ASSEMBLY_VERSION) errs.push(`version must be ${ASSEMBLY_VERSION}`);
  if (!m.comicId || !/^[a-f0-9]{8}$/.test(m.comicId)) errs.push('comicId must be 8 hex chars');
  if (!m.layoutPlan) errs.push('layoutPlan required');
  else errs.push(...validateLayoutPlan(m.layoutPlan).map((e) => `layoutPlan: ${e}`));
  // pageContext는 없을 수 있다(planner 실패). 있으면 계약을 지켜야 한다.
  if (m.pageContext) errs.push(...validatePageContext(m.pageContext).map((e) => `pageContext: ${e}`));
  if (!m.panelKeys || typeof m.panelKeys !== 'object') errs.push('panelKeys required');
  if (!Array.isArray(m.warnings)) errs.push('warnings must be an array (빈 배열이라도 있어야 한다)');
  return errs;
}

/**
 * POST multipart/form-data — `page`(image/png) + `manifest`(JSON 문자열)
 *
 * manifest 없이 그림만 받지 않는다. 그림만 남으면 "이게 어떤 좌표·어떤 문맥으로 조립된
 * 것인지"를 영영 모른다 — 그때부터 그 페이지는 추측의 대상이 된다.
 */
export const onRequestPost: PagesFunction<Env> = async ({ request, env }) => {
  let form: FormData;
  try { form = await request.formData(); } catch { return json(400, { ok: false, error: 'bad_form' }); }

  const raw = form.get('manifest');
  if (typeof raw !== 'string') return json(400, { ok: false, error: 'manifest_required' });
  let manifest: unknown;
  try { manifest = JSON.parse(raw); } catch { return json(400, { ok: false, error: 'manifest_unparsable' }); }
  const errs = validateManifest(manifest);
  if (errs.length) return json(422, { ok: false, error: 'manifest_invalid', detail: errs });

  const page = form.get('page');
  if (!(page instanceof File) && !(page instanceof Blob)) return json(400, { ok: false, error: 'page_required' });
  const bytes = await (page as Blob).arrayBuffer();
  if (!bytes.byteLength) return json(400, { ok: false, error: 'page_empty' });
  if (bytes.byteLength > MAX_PAGE_BYTES) return json(413, { ok: false, error: 'page_too_large' });

  const m = manifest as AssemblyManifest;
  const key = `${COMIC_STRIP_PREFIX}${m.comicId}/page.png`;
  const manifestKey = `${COMIC_STRIP_PREFIX}${m.comicId}/manifest.json`;
  // 그림 먼저, manifest 나중 — 순서가 뒤집히면 "manifest는 있는데 그림이 없는" 상태가 남는다.
  await env.CAPTURES.put(key, bytes, { httpMetadata: { contentType: 'image/png' } });
  await env.CAPTURES.put(manifestKey, JSON.stringify({ ...m, assembledAt: Date.now() }), {
    httpMetadata: { contentType: 'application/json; charset=utf-8' },
  });

  return json(200, {
    ok: true, key, manifestKey, bytes: bytes.byteLength,
    panels: Object.keys(m.panelKeys).length,
    font: m.font,
    warnings: m.warnings,
  });
};
