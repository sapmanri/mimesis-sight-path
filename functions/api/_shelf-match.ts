// 서가 대조 — 웹에서 고른 곡이 서가에 **정말 그 녹음으로** 있는지 가린다 (Vase 설계 2026-07-27)
//
// 이 파일은 서가에 매이지 않는다. 후보를 `ShelfCandidate` 꼴로만 주면 어느 서가든 같은 규칙으로
// 가린다 — YouTube로 시작하지만 나중에 Spotify·Apple로 옮겨도 이 부분은 그대로 쓴다.
// 서가는 **음원을 확인하고 재생목록을 만드는 곳**이지 음악을 발견하는 두뇌가 아니다.
//
// ⚠ 가장 중요한 규칙: 커버·노래방·8D 같은 것은 **감점이 아니라 탈락**이다.
//   점수로만 깎으면 정확 일치 가산점(제목+가수)이 커서 **라이브 버전이 원곡을 이긴다.**
//   (2026-07-27 설계 검토에서 Vase의 점수표가 정확히 그 구멍을 갖고 있었다:
//    정확 일치 +75 대 라이브 -30 → 라이브가 이긴다)
//
// ⚠ YouTube는 하루 `search.list` 100회가 한도다. 그래서 한 곡에 검색을 여러 번 쓰지 않는다 —
//   한 번 검색해 후보를 받고, 싼 `videos.list`(1유닛)로 자세히 본 뒤 여기서 가린다.

export type Shelf = 'youtube' | 'spotify';

/** 서가에서 받은 후보 하나. 서가마다 채우는 필드가 다를 수 있고, 없으면 없는 대로 판단한다. */
export interface ShelfCandidate {
  id: string;
  title: string;              // 서가에 적힌 제목 (YouTube는 영상 제목)
  channel?: string;           // YouTube 채널명 / Spotify 아티스트명
  durationSec?: number | null;
  /** 서가가 "공식 음원"이라고 표시해주는 경우. YouTube는 `- Topic` 채널이 그 역할을 한다. */
  officialHint?: boolean;
  isrc?: string | null;
}

export interface ShelfQuery {
  title: string;
  artist: string;
  album?: string | null;
  /** 웹에서 읽어 알아낸 러닝타임. 있으면 '한 시간짜리 전곡 모음' 같은 걸 걸러낸다. */
  durationSec?: number | null;
  /** 별이가 일부러 라이브·리믹스를 찾는 경우가 있다. 그때만 그 판을 허용한다. */
  want?: 'studio' | 'live' | 'any';
}

export interface MatchResult {
  candidate: ShelfCandidate;
  score: number;
  reasons: string[];
  disqualified: string | null;   // 탈락 사유. 있으면 점수와 무관하게 못 쓴다
}

/** 무조건 탈락 — 원곡이 아닌 것들. 별이가 일부러 찾은 게 아니면 여기서 끝난다.
 *
 * ⚠ **순서가 뜻을 정한다.** 먼저 걸리는 규칙의 이름이 탈락 사유로 저장소에 남는다.
 *   "Hurt (AI Cover)"가 넓은 `cover`에 먼저 걸리면 기록이 `cover`가 되어, 나중에
 *   "AI 커버가 얼마나 섞여 들어오나"를 물을 수 없다. **좁은 것을 위에 둔다.** */
const DISQUALIFY: Array<[RegExp, string]> = [
  [/\bai\s?(cover|voice)\b|ai커버/i, 'ai_cover'],
  [/\b(karaoke|instrumental|inst\.?|mr)\b|노래방|반주/i, 'karaoke_or_instrumental'],
  [/\bcover(ed)?\b|커버|불러봤|불러본/i, 'cover'],
  [/\b(sped\s?up|speed\s?up|slowed|reverb|nightcore|daycore)\b|배속/i, 'speed_or_pitch_edit'],
  [/\b8d\b|\bearrape\b|\bbass\s?boost/i, 'audio_gimmick'],
  [/\breaction\b|리액션|\btutorial\b|\bhow to play\b|\blesson\b|강좌/i, 'not_music'],
];

/** 라이브 표시 — `want`가 studio면 탈락, live면 오히려 가산. */
const LIVE = /\blive\b|\bconcert\b|\bsession\b|\bunplugged\b|라이브|콘서트|공연실황/i;

/** 이름 비교용 — 괄호 주석·리마스터 표기·feat를 떨어낸다. */
export function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .replace(/\(([^)]*)\)|\[([^\]]*)\]/g, ' ')
    .replace(/\s-\s.*(remaster|remastered|version|edit|mono|stereo|official.*(video|audio)).*$/i, ' ')
    .replace(/\b(feat|ft)\.?\s.*$/i, ' ')
    .replace(/\b(official|audio|video|mv|m\/v|lyrics?|hd|4k)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

const contains = (hay: string, needle: string) =>
  !!needle && (hay === needle || hay.includes(needle));

/** YouTube의 자동 생성 음원 채널. 유통사가 배급한 **공식 음원**이라는 가장 강한 신호다. */
export const isTopicChannel = (channel?: string) => /\s-\s*topic$/i.test(String(channel || '').trim());

/** 공식으로 볼 수 있는 채널인가.
 *
 * ⚠ 실측(2026-07-27, Johnny Cash 'Hurt' 라이브 호출)에서 드러난 구멍:
 *   `- Topic`만 공식으로 쳤더니 **JohnnyCashVEVO가 50점**으로, 정체불명 재업로드
 *   (The Match Me Podcast 60, machineelf 60)보다 **낮게** 나왔다.
 *   재업로드가 우연히 길이만 맞아 duration_tight 가산점을 받았기 때문이다.
 *   그날은 공식 아티스트 채널이 64점으로 이겨서 결과가 맞았지만 **운이었다.**
 *
 * 공식으로 치는 세 가지:
 *   · `<가수> - Topic`  자동 생성 음원(Art Track)
 *   · `<가수>VEVO`      유통사 공식 채널
 *   · 채널명 == 가수명   공식 아티스트 채널(OAC) */
export function isOfficialChannel(channel: string | undefined, artist: string): boolean {
  const ch = String(channel || '').trim();
  if (!ch) return false;
  if (isTopicChannel(ch)) return true;
  if (/vevo$/i.test(ch.replace(/\s+/g, ''))) return true;
  return norm(ch) === norm(artist) && !!norm(artist);
}

export function matchOne(q: ShelfQuery, c: ShelfCandidate): MatchResult {
  const want = q.want || 'studio';
  const raw = `${c.title} ${c.channel || ''}`;
  const reasons: string[] = [];

  // ── 탈락 먼저. 점수를 매기기 전에 자른다 ──
  for (const [re, why] of DISQUALIFY) {
    if (re.test(raw)) return { candidate: c, score: 0, reasons, disqualified: why };
  }
  const live = LIVE.test(raw);
  if (live && want === 'studio') return { candidate: c, score: 0, reasons, disqualified: 'live_but_studio_wanted' };
  if (!live && want === 'live') return { candidate: c, score: 0, reasons, disqualified: 'studio_but_live_wanted' };

  // 러닝타임이 크게 어긋나면 다른 것이다 (전곡 모음·짜깁기·미리듣기)
  if (q.durationSec && c.durationSec) {
    const off = Math.abs(c.durationSec - q.durationSec);
    if (off > Math.max(25, q.durationSec * 0.2)) {
      return { candidate: c, score: 0, reasons, disqualified: `duration_off_${Math.round(off)}s` };
    }
  }
  // 러닝타임을 모를 때의 최소 방어 — 15분 넘는 건 한 곡이 아니다
  if (!q.durationSec && c.durationSec && c.durationSec > 15 * 60) {
    return { candidate: c, score: 0, reasons, disqualified: 'too_long_probably_album' };
  }

  // ── 여기부터 점수 ──
  let score = 0;
  const nt = norm(c.title), na = norm(c.artist ?? ''), ch = norm(c.channel || '');
  const qt = norm(q.title), qa = norm(q.artist);

  if (nt === qt) { score += 35; reasons.push('title_exact'); }
  else if (contains(nt, qt)) { score += 24; reasons.push('title_contains'); }

  // YouTube는 영상 제목에 "가수 - 곡명"이 함께 오는 일이 흔하다. 채널·제목 양쪽을 본다.
  if (ch === qa || na === qa) { score += 40; reasons.push('artist_exact'); }
  else if (contains(ch, qa) || contains(nt, qa)) { score += 26; reasons.push('artist_contains'); }

  // 공식 표시를 길이 우연보다 무겁게 둔다 — 안 그러면 재업로드가 공식을 이긴다(위 실측)
  if (c.officialHint || isOfficialChannel(c.channel, q.artist)) { score += 26; reasons.push('official_channel'); }
  if (q.album && contains(norm(c.title), norm(q.album))) { score += 8; reasons.push('album_hint'); }
  // ⚠ 기대 길이는 웹에서 읽은 값이라 틀릴 수 있다(실측에서 218 vs 실제 229로 어긋났다).
  //   가산점을 크게 주면 **틀린 기대에 우연히 맞은 재업로드**가 공식을 이긴다. 작게 준다.
  if (q.durationSec && c.durationSec && Math.abs(c.durationSec - q.durationSec) <= 3) {
    score += 4; reasons.push('duration_tight');
  }
  if (live && want === 'live') { score += 10; reasons.push('live_wanted'); }

  return { candidate: c, score, reasons, disqualified: null };
}

/** 살아남은 것 중 최고점. 아무것도 못 넘으면 **null** — 억지로 담지 않는다.
    (서가에 없으면 없다고 하는 게 엉뚱한 녹음을 담는 것보다 낫다) */
export const MIN_SCORE = 55;

export function pickBest(q: ShelfQuery, cs: ShelfCandidate[]): { best: MatchResult | null; all: MatchResult[] } {
  const all = cs.map((c) => matchOne(q, c));
  const alive = all.filter((r) => !r.disqualified && r.score >= MIN_SCORE);
  alive.sort((a, b) => b.score - a.score);
  return { best: alive[0] ?? null, all };
}
