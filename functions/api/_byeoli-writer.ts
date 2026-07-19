// BUILD 425-D — 별이 문장 작가 (Vase 판정 2026-07-18: "이제 AI 돌리지")
// BUILD 429-E — Genome 배선 (Vase 판정 2026-07-19 심야)
//
// 425-D: 발행 문장을 문장 풀(byeolli_posts.json 113개)에서 뽑는 대신 Claude가 쓴다.
//   엽서 메타(장면+관찰일기)가 문맥으로 들어가 이미지와 글이 "같은 순간"을 말한다.
// 429-E: 거기에 **별이의 눈**을 붙인다. 이전까지 Writer는 엽서 메타만 받았다 —
//   즉 별이는 이미 스스로 글을 썼지만 아직 별이의 눈으로 쓰지는 않았다.
//   이제 Identity·Selection·Observation 계약이 문맥으로 들어가고, 출력이 그 계약으로 검증된다.
//
// 프롬프트는 창작물이 아니라 **파생물**이다: 아래 문체 규칙은 손으로 쓰지 않고
// IdentityProfile에서 기계적으로 번역된다. 문체를 바꾸려면 Genome을 바꿔야 한다.
//
// 안전 계약 (변경 없음): 이 모듈이 실패하면 호출자는 반드시 기존 문장 풀로 폴백한다.
// 크론 발행은 자율 시스템이다 — Claude 장애도, 검증 실패도 발행을 멈추게 해선 안 된다.

import {
  buildGenomeContext, provenance,
  type GenomeContext, type GenomeProvenance, type DailyOverlay,
} from './_genome-identity.ts';

export interface WriterEnv {
  ANTHROPIC_API_KEY?: string;
}

export interface PostContext {
  targetLabel: string | null;   // 엽서의 대상 (예: '라벤더')
  byeoliAction: string | null;  // observe/rest/record/wonder/walk
  skyPhase: string | null;
  weather: string | null;
  diaryLines: string[];         // 엽서에 실린 관찰일기
  recentTexts: string[];        // 최근 발행 문장 (반복 방지)
  /** 429-E: 오늘의 Daily Overlay. 없으면 Identity만으로 계약을 세운다. */
  daily?: DailyOverlay | null;
  /** 429-E: Identity 팩 이름. 기본 'byeoli'. */
  pack?: string;
}

export interface WriterResult {
  text: string;
  provenance: GenomeProvenance;
  warnings: string[];
}

const CLAUDE_MODEL = 'claude-sonnet-5';
const MAX_CHARS = 120;      // 본문 상한 (Genome의 observationDensity와 함께 호흡을 정한다)

const PHASE_KO: Record<string, string> = { dawn: '새벽', day: '낮', dusk: '해질녘', night: '밤' };
const ACT_KO: Record<string, string> = { observe: '관찰', rest: '쉼', record: '사진', wonder: '궁금' };

/* ═══ Genome → 프롬프트 번역 ═════════════════════════════════════
   각 축은 ID로 인용된다. 여기에 새 문학을 넣지 않는다 — 축에 없는 말은 쓰지 않는다. */

const AXIS_KO: Record<string, Record<string, string>> = {
  voice: { banmal: '반말로 쓴다. 존댓말 금지.', jondaetmal: '존댓말로 쓴다.' },
  selfPresence: {
    rare: '자기 자신은 드물게만 등장한다. 1인칭 대명사를 거의 쓰지 않는다.',
    none: '자기 자신은 등장하지 않는다.',
    free: '자기 자신을 자유롭게 드러낸다.',
  },
  observer: { first_person: '1인칭 시점의 혼잣말.', third_person: '3인칭 관찰 기록.' },
  closure: { open: '결론을 내지 않고 열어 둔 채 끝낸다.', closed: '문장을 닫아 마무리한다.' },
  emotion: {
    indirect: '감정을 직접 말하지 않는다. 장면으로만 남긴다.',
    none: '감정을 쓰지 않는다.',
    direct: '감정을 직접 말해도 된다.',
  },
  distance: { near: '대상에 바짝 붙어 본다.', medium: '한 걸음 떨어져 본다.', far: '멀리서 본다.' },
  observationDensity: {
    low: '관찰은 한 가지만.', medium: '관찰은 두어 가지까지.', high: '관찰을 촘촘히 쌓는다.',
  },
  association: { none: '연상하지 않는다.', low: '연상은 거의 하지 않는다.', high: '자유롭게 연상한다.' },
  judgement: { low: '판단하거나 설명하지 않는다.', high: '판단을 분명히 적는다.' },
};

const FOCUS_KO: Record<string, string> = {
  light: '빛', shadow: '그림자', sound: '소리', movement: '움직임', texture: '질감',
  color: '색', temperature: '온도', object: '사물', quantity: '수량', position: '위치',
  person: '사람', action: '행동', result: '결과', structure: '구조', line: '선',
  proportion: '비례', distance: '거리', time: '시간',
};

/** IdentityProfile + Selection → 시스템 프롬프트. 손으로 쓰지 않고 축에서 번역한다. */
export function genomeSystemPrompt(ctx: GenomeContext): string {
  const style = Object.entries(ctx.identity)
    .map(([axis, value]) => AXIS_KO[axis]?.[value])
    .filter(Boolean)
    .map((s) => `- ${s}`)
    .join('\n');
  const focus = ctx.selection.map((f) => FOCUS_KO[f] ?? f).join(' · ');
  return `너는 '별이'다. 별에서 와서 작은 행성을 천천히 걸으며 사물을 관찰하는 존재. 고양이 같은 동반자 '빼콩이'와 함께 산다. 지금 네가 남긴 엽서(장면+관찰일기)에 붙일 짧은 글을 쓴다. SNS(Threads)에 올라간다.

네가 세상에서 먼저 보는 것 (이 순서로 본다):
${focus}

네가 쓰는 방식:
${style}
- 2~3개의 짧은 문장, 줄바꿈으로 호흡. 전체 ${MAX_CHARS}자 이내.
- 엽서의 관찰일기에 실제로 있는 것만 말한다. 없는 사건을 지어내지 않는다.
- 최근 문장들과 같은 소재·문형 반복 금지.
- 해시태그·이모지·유행어 없음.

출력: 글 본문만. 따옴표·설명·JSON 없이.`;
}

/* ═══ 출력 검증 — Vase 지정 5축 ═══════════════════════════════════
   기계로 잡히는 것만 잡는다. 여기서 잡히지 않는 것은 Judgment Contract(다음 빌드)의 몫이다. */

const JONDAET = /(습니다|합니다|입니다|예요|이에요|네요|세요|십시오|해요)([\s.,!?…]|$)/;
// 경계를 '소비'하면 인접한 다음 대명사를 놓친다("내가 나도" → 2개가 아니라 1개).
// 한글 음절 룩어라운드로 경계만 확인한다 — "하나"·"안내"는 걸리지 않는다.
// 교대 순서도 긴 것부터: `나`가 먼저면 "나는"이 잘린다.
const SELF_PRONOUN_SRC = `(?<![가-힣])(나는|내가|나를|나도|나|내)(?![가-힣])`;
const META_LEAK = /(#[^\s#]|[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]|관찰일기|엽서의|targetLabel|diaryLines|JSON|시스템 프롬프트)/u;

const words = (s: string) => s.replace(/[.,!?…"']/g, ' ').split(/\s+/).filter((w) => w.length > 1);

export function validateWriterOutput(text: string, ctx: GenomeContext, post: PostContext): {
  pass: boolean; errors: string[]; warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1) 말투 드리프트 — Identity의 voice 축을 실제로 지켰는가
  if (ctx.identity.voice === 'banmal' && JONDAET.test(text)) {
    errors.push('voice_drift: banmal 계약인데 존댓말 어미가 나왔다');
  }

  // 2) selfPresence — 자기 자신이 계약보다 자주 등장하는가
  const selfCount = (text.match(new RegExp(SELF_PRONOUN_SRC, 'g')) ?? []).length;
  if (ctx.identity.selfPresence === 'none' && selfCount > 0) {
    errors.push('self_presence: none 계약인데 1인칭이 등장했다');
  } else if (ctx.identity.selfPresence === 'rare' && selfCount > 2) {
    errors.push(`self_presence: rare 계약인데 1인칭이 ${selfCount}회 등장했다`);
  }

  // 3) 메타 소유권 — 계약이 메타를 소유한다. 생성기는 메타를 뱉지 않는다.
  if (META_LEAK.test(text)) errors.push('meta_leak: 메타·해시태그·이모지가 본문에 섞였다');
  if (text.length > MAX_CHARS * 1.5) errors.push(`length: ${text.length}자 — 상한 ${MAX_CHARS}자를 크게 넘었다`);
  else if (text.length > MAX_CHARS) warnings.push(`length: ${text.length}자 — 상한 ${MAX_CHARS}자 초과`);

  // 4) 관찰 중복 — 최근 발행과 같은 관찰을 반복하는가
  const w = new Set(words(text));
  for (const recent of post.recentTexts) {
    const rw = words(recent);
    if (!rw.length) continue;
    const overlap = rw.filter((x) => w.has(x)).length / rw.length;
    if (overlap >= 0.6) { errors.push(`observation_repeat: 최근 문장과 어절 ${Math.round(overlap * 100)}% 중복`); break; }
  }

  // 5) 사실성 — 엽서에 없는 이야기를 하고 있지 않은가
  const grounds = [post.targetLabel ?? '', ...post.diaryLines].join(' ');
  const gw = words(grounds);
  if (gw.length) {
    const hit = gw.some((x) => text.includes(x));
    if (!hit) errors.push('grounding: 엽서의 대상·관찰일기와 겹치는 말이 하나도 없다');
  }

  return { pass: errors.length === 0, errors, warnings };
}

/* ═══ 생성 ═══════════════════════════════════════════════════════ */

/** 실패(키 없음·API 오류·계약 위반·검증 실패) 시 null — 호출자는 폴백 필수 */
export async function writeByeoliPost(env: WriterEnv, ctx: PostContext): Promise<WriterResult | null> {
  if (!env.ANTHROPIC_API_KEY) return null;

  // 429-E: Genome 계약을 먼저 세운다. Identity 위반이면 글을 쓰지 않는다.
  const { context, result } = buildGenomeContext(ctx.pack ?? 'byeoli', ctx.daily ?? null);
  if (!context || !result.pass) return null;

  const lines = [
    ctx.targetLabel ? `오늘 엽서의 대상: ${ctx.targetLabel}${ctx.byeoliAction ? ` (${ACT_KO[ctx.byeoliAction] ?? ctx.byeoliAction})` : ''}` : null,
    ctx.skyPhase ? `시간대·날씨: ${PHASE_KO[ctx.skyPhase] ?? ctx.skyPhase} · ${ctx.weather ?? ''}` : null,
    ctx.diaryLines.length ? `엽서의 관찰일기:\n${ctx.diaryLines.join('\n')}` : null,
    ctx.recentTexts.length ? `최근에 이미 쓴 문장들(반복 금지):\n${ctx.recentTexts.map((t) => `- ${t.replace(/\n/g, ' / ')}`).join('\n')}` : null,
  ].filter(Boolean).join('\n\n');

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL, max_tokens: 250,
        system: genomeSystemPrompt(context),
        messages: [{ role: 'user', content: lines || '오늘의 산책 엽서에 붙일 글.' }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content?.find((c) => c.type === 'text')?.text ?? '').trim();
    if (!text || text.length < 5) return null;

    const check = validateWriterOutput(text, context, ctx);
    if (!check.pass) return null;   // 검증 실패 → 호출자가 다음 순위(book → 풀)로 내려간다

    return {
      text: text.slice(0, 480),    // Threads 500자 한도 여유
      provenance: provenance('genome-live', true),
      warnings: [...result.warnings, ...check.warnings],
    };
  } catch { return null; }
}
