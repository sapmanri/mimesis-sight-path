// BUILD 425-D — 별이 문장 작가 (Vase 판정 2026-07-18: "이제 AI 돌리지")
//
// 발행 문장을 문장 풀(byeolli_posts.json 113개, 임시)에서 뽑는 대신 Claude가 쓴다.
// 핵심 개선: 엽서 메타(그 장면의 관찰일기·대상·시간대)가 문맥으로 들어가므로
// 이미지와 글이 처음으로 "같은 순간"을 말한다 (425 §1의 랜덤 결합 문제 해소).
//
// 안전 계약: 이 모듈이 실패하면 호출자는 반드시 기존 문장 풀로 폴백한다.
// 크론 발행은 자율 시스템이다 — Claude 장애가 발행을 멈추게 해선 안 된다.

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
}

const CLAUDE_MODEL = 'claude-sonnet-5';

const WRITER_SYSTEM = `너는 '별이'다. 별에서 와서 작은 행성을 천천히 걸으며 사물을 관찰하는 존재. 고양이 같은 동반자 '빼콩이'와 함께 산다. 지금 네가 남긴 엽서(장면+관찰일기)에 붙일 짧은 글을 쓴다. SNS(Threads)에 올라간다.

문체 (기존 별이 글과 같은 결):
- 1인칭 혼잣말, 반말. 담담하고 조금 시적. 과장·유행어·해시태그·이모지 없음.
- 2~3개의 짧은 문장, 줄바꿈으로 호흡. 전체 120자 이내.
- 관찰에서 시작해 작은 사색으로 끝나면 좋다. 설명하지 않는다.
- 엽서의 관찰일기에 실제로 있는 것만 말한다. 없는 사건을 지어내지 않는다.
- 최근 문장들과 같은 소재·문형 반복 금지.

기존 글 예시(결 참고):
"지구 사람들은 밤이 되면 다 불을 켜더라.\n어둠이 무서운 걸까, 아니면 어둠도 예뻐서 보고 싶은 걸까."
"빼콩이가 자기 꼬리를 잡으려고 빙빙 돈다.\n나도 별을 그렇게 돌고 있는 건 아닐까."

출력: 글 본문만. 따옴표·설명·JSON 없이.`;

const PHASE_KO: Record<string, string> = { dawn: '새벽', day: '낮', dusk: '해질녘', night: '밤' };
const ACT_KO: Record<string, string> = { observe: '관찰', rest: '쉼', record: '사진', wonder: '궁금' };

/** 실패 시 null — 호출자는 문장 풀 폴백 필수 */
export async function writeByeoliPost(env: WriterEnv, ctx: PostContext): Promise<string | null> {
  if (!env.ANTHROPIC_API_KEY) return null;
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
        system: WRITER_SYSTEM,
        messages: [{ role: 'user', content: lines || '오늘의 산책 엽서에 붙일 글.' }],
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content?.find((c) => c.type === 'text')?.text ?? '').trim();
    if (!text || text.length < 5) return null;
    return text.slice(0, 480); // Threads 500자 한도 여유
  } catch { return null; }
}
