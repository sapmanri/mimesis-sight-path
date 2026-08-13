// 별이의 실제 Threads 자율 실행선.
// 정시 슬롯과 사람 승인 없이, 별이가 스스로 고른 1회 알람에서 자기 공간을 둘러본다.
// @byeoli_log에만 쓰며 @byeol.toon 등 외부 계정은 이 파일의 후보로 읽기만 한다.

import { appendPublishLog } from './_publish-log.ts';
import { chooseEditorial, radioEditorialCandidates, type EditorialDecision } from './_byeoli-editorial.ts';
import { dispatchToThreads, type ThreadsEnv } from './_threads-client.ts';
import { WEB_OBSERVATIONS_KEY } from './_radio-observations.ts';
import { refreshThreadsShelf } from './_radio-social.ts';
import { THREADS_SHELF_KEY, type ThreadsShelf } from './_radio-social-types.ts';
import { PROGRAM_KEY, type ProgramSegment } from './_station.ts';
import { decodeToonShelf, TOON_KEY } from './_radio-toon.ts';
import { resolveObservedExternalTargets, type ExternalTargetReceipt } from './_threads-public.ts';
import {
  processCollectedReplies, type AutonomousReplyRun, type Env as ReplyEnv,
} from './ops/threads-replies.ts';
import {
  isAgencyWake, isRecentDuplicate, observationText,
  type SocialTrigger, type SocialTriggerKind,
} from './_byeoli-social-agent-logic.ts';

export { isRecentDuplicate, observationText, parseSocialTrigger } from './_byeoli-social-agent-logic.ts';
export type { SocialTrigger, SocialTriggerKind } from './_byeoli-social-agent-logic.ts';

export const SOCIAL_RECEIPTS_KEY = 'radio:social-agent:receipts:v1';
export const SOCIAL_STATE_KEY = 'radio:social-agent:state:v1';
const SOCIAL_LEASE_KEY = 'radio:social-agent:lease:v1';
const SOCIAL_EVENT_PREFIX = 'radio:social-agent:event:';
const RECEIPT_KEEP = 120;

export interface SocialAgentEnv extends ThreadsEnv, ReplyEnv {
  PULSE_KEY?: string;
  YOUTUBE_API_KEY?: string;
}

export interface SocialAgentReceipt {
  version: 'byeoli-social-agent-v1';
  runId: string;
  at: number;
  finishedAt: number;
  trigger: SocialTrigger;
  ok: boolean;
  duplicate: boolean;
  account: { ok: boolean; count: number; error: string | null };
  externalComments: ExternalTargetReceipt;
  replies: AutonomousReplyRun | null;
  editorial: null | {
    source: EditorialDecision['source'];
    action: EditorialDecision['action'];
    reason: string;
    text: string | null;
    targetPostId: string | null;
  };
  post: {
    attempted: boolean;
    ok: boolean;
    errorCode: string | null;
    requestId: string | null;
  };
  continuationNeeded: boolean;
  continuationDelayMs: number | null;
  nextLookAt: number | null;
  error: string | null;
}

async function loadReceipts(kv: KVNamespace): Promise<SocialAgentReceipt[]> {
  try {
    const raw = await kv.get(SOCIAL_RECEIPTS_KEY);
    return raw ? JSON.parse(raw) as SocialAgentReceipt[] : [];
  } catch { return []; }
}

async function saveReceipt(env: SocialAgentEnv, receipt: SocialAgentReceipt): Promise<void> {
  const receipts = await loadReceipts(env.PLANET);
  await Promise.all([
    env.PLANET.put(SOCIAL_RECEIPTS_KEY, JSON.stringify([receipt, ...receipts].slice(0, RECEIPT_KEEP))),
    env.PLANET.put(SOCIAL_STATE_KEY, JSON.stringify(receipt)),
    env.PLANET.put(`${SOCIAL_EVENT_PREFIX}${encodeURIComponent(receipt.trigger.eventId)}`, JSON.stringify(receipt), {
      expirationTtl: 30 * 86_400,
    }),
  ]);
}

async function eligibleSegments(env: SocialAgentEnv, segments: ProgramSegment[]): Promise<ProgramSegment[]> {
  const now = Date.now();
  const recent = segments.filter((segment) => segment.startAt <= now && segment.script)
    .sort((a, b) => b.startAt - a.startAt).slice(0, 8);
  const checked = await Promise.all(recent.map(async (segment) => {
    if (segment.kind !== 'story') return segment;
    if (!segment.storyId) return null;
    const key = `radio:story-air:${segment.storyId}:${segment.id}:${Math.trunc(segment.startAt)}`;
    return await env.PLANET.get(key) ? segment : null;
  }));
  const past = checked.filter((segment): segment is ProgramSegment => !!segment);
  const upcoming = segments.filter((segment) => segment.startAt > now && segment.startAt < now + 12 * 3_600_000);
  return [...past, ...upcoming];
}

function emptyReplyRun(error: string): AutonomousReplyRun {
  return {
    ingest: {
      ok: false, error, added: 0, checked: 0, total: 0, pages: 0,
      cycleComplete: false, remainingPosts: 0,
    },
    examined: 0, published: 0, ignored: 0, bookmarked: 0, failed: 1, pending: 0,
    continuationNeeded: true, continuationDelayMs: 10 * 60_000,
    publishedIds: [], errors: [error],
  };
}

export async function readSocialAgentStatus(env: Pick<SocialAgentEnv, 'PLANET'>): Promise<{
  state: SocialAgentReceipt | null; receipts: SocialAgentReceipt[];
}> {
  const [stateRaw, receipts] = await Promise.all([env.PLANET.get(SOCIAL_STATE_KEY), loadReceipts(env.PLANET)]);
  let state: SocialAgentReceipt | null = null;
  try { state = stateRaw ? JSON.parse(stateRaw) as SocialAgentReceipt : null; } catch { /* state remains null */ }
  return { state, receipts };
}

export async function runSocialAgent(env: SocialAgentEnv, trigger: SocialTrigger): Promise<SocialAgentReceipt> {
  const existingRaw = await env.PLANET.get(`${SOCIAL_EVENT_PREFIX}${encodeURIComponent(trigger.eventId)}`);
  if (existingRaw) {
    const existing = JSON.parse(existingRaw) as SocialAgentReceipt;
    return { ...existing, duplicate: true };
  }

  const at = Date.now();
  const leaseRaw = await env.PLANET.get(SOCIAL_LEASE_KEY);
  if (leaseRaw) {
    try {
      const lease = JSON.parse(leaseRaw) as { expiresAt?: number };
      if (Number(lease.expiresAt) > at) {
        return {
          version: 'byeoli-social-agent-v1', runId: `social_busy_${at}`, at, finishedAt: at,
          trigger, ok: false, duplicate: false,
          account: { ok: false, count: 0, error: 'agent_busy' }, replies: null, editorial: null,
          externalComments: { ok: false, count: 0, account: '@byeol.toon', error: 'agent_busy' },
          post: { attempted: false, ok: false, errorCode: null, requestId: null },
          continuationNeeded: true, continuationDelayMs: 60_000,
          nextLookAt: null, error: 'agent_busy_current_state_will_be_seen_next_run',
        };
      }
    } catch { /* 깨진 임대는 덮어쓴다 */ }
  }
  const runId = `social_${at}_${crypto.randomUUID().slice(0, 8)}`;
  await env.PLANET.put(SOCIAL_LEASE_KEY, JSON.stringify({ runId, expiresAt: at + 5 * 60_000 }), { expirationTtl: 300 });

  let account = { ok: false, count: 0, error: null as string | null };
  let externalComments: ExternalTargetReceipt = {
    ok: true, count: 0, account: '@byeol.toon', error: null,
  };
  let replies: AutonomousReplyRun | null = null;
  let editorial: SocialAgentReceipt['editorial'] = null;
  let post: SocialAgentReceipt['post'] = {
    attempted: false, ok: false, errorCode: null, requestId: null,
  };
  let nextLookAt: number | null = null;
  let error: string | null = null;

  try {
    const refreshed = await refreshThreadsShelf(env);
    account = { ok: refreshed.ok, count: refreshed.count, error: refreshed.error };
    try { replies = await processCollectedReplies(env); }
    catch (replyError) {
      const message = replyError instanceof Error ? replyError.message : 'reply_runner_failed';
      replies = emptyReplyRun(message.slice(0, 160));
    }

    // 백로그·방송·관찰은 별이에게 글쓰기 임무를 주지 않는다. 자기 기상에서만 한 번
    // 자기 공간을 둘러보고, 쓰기·댓글·침묵과 다음 기상을 별이가 직접 고른다.
    if (isAgencyWake(trigger.kind)) {
      const [programRaw, observationsRaw, shelfRaw, toonRaw] = await Promise.all([
        env.PLANET.get(PROGRAM_KEY), env.PLANET.get(WEB_OBSERVATIONS_KEY),
        env.PLANET.get(THREADS_SHELF_KEY), env.PLANET.get(TOON_KEY),
      ]);
      let segments: ProgramSegment[] = [];
      let observationRaw: unknown = null;
      let shelf: ThreadsShelf | null = null;
      let toonShelf = decodeToonShelf(null);
      try { segments = programRaw ? JSON.parse(programRaw) as ProgramSegment[] : []; } catch { /* empty */ }
      try { observationRaw = observationsRaw ? JSON.parse(observationsRaw) : null; } catch { /* empty */ }
      try { shelf = shelfRaw ? JSON.parse(shelfRaw) as ThreadsShelf : null; } catch { /* empty */ }
      try { toonShelf = toonRaw ? decodeToonShelf(JSON.parse(toonRaw)) : null; } catch { /* empty */ }
      const ownThreads = shelf?.posts?.filter((item) => !item.isReply && item.id && item.text).map((item) => ({
        id: item.id, text: item.text, timestamp: item.timestamp,
        username: '@byeoli_log', ownership: 'self' as const,
      })) ?? [];
      const recentActivity = shelf?.posts?.filter((item) => item.id && item.text).slice(0, 20).map((item) => ({
        id: item.id, text: item.text, timestamp: item.timestamp,
        username: '@byeoli_log', ownership: 'self' as const,
      })) ?? [];
      const external = await resolveObservedExternalTargets(env, toonShelf);
      externalComments = external.receipt;
      const recentOwnThreads = ownThreads.slice(0, 12);
      const commentTargets = [
        ...recentOwnThreads,
        ...external.targets.map((item) => ({
          id: item.id, text: item.text, timestamp: item.timestamp,
          username: item.username, ownership: 'external_observed' as const,
        })),
      ];
      const recentTexts = shelf?.posts?.map((item) => item.text).filter(Boolean) ?? [];
      const candidates = radioEditorialCandidates(
        observationText(observationRaw), await eligibleSegments(env, segments), Date.now(),
      );
      const decision = await chooseEditorial(env, candidates, commentTargets, recentActivity);
      if (!decision) {
        error = candidates.length ? 'editorial_decision_unavailable' : 'editorial_candidates_empty';
      } else {
        editorial = {
          source: decision.source, action: decision.action, reason: decision.reason,
          text: decision.text, targetPostId: decision.targetPostId,
        };
        const requestedNext = decision.nextLookInMinutes == null
          ? null
          : Date.now() + decision.nextLookInMinutes * 60_000;
        nextLookAt = requestedNext != null && Number.isFinite(requestedNext) && requestedNext <= 8.64e15
          ? Math.trunc(requestedNext)
          : null;
        if (decision.action === 'silence' || decision.source === 'silence' || !decision.text) {
          await appendPublishLog(env, {
            invokedAt: Date.now(), scheduledFor: null, result: 'editorial_skip', httpStatus: 200,
            textIndex: null, imageKey: null,
            threads: { attempted: false, ok: false, errorCode: null, requestId: null },
            editorial: { source: 'silence', action: 'silence', targetPostId: null, reason: decision.reason },
          });
        } else if (isRecentDuplicate(decision.text, recentTexts)) {
          error = 'recent_text_duplicate_blocked';
        } else {
          const result = await dispatchToThreads(
            env, decision.text, null, false,
            decision.action === 'comment' ? decision.targetPostId : null,
          );
          post = {
            attempted: result.attempted, ok: result.ok,
            errorCode: result.errorCode, requestId: result.requestId,
          };
          await appendPublishLog(env, {
            invokedAt: Date.now(), scheduledFor: null,
            result: result.ok ? 'success' : 'threads_failed', httpStatus: 200,
            textIndex: null, imageKey: null, threads: post,
            editorial: {
              source: decision.source, action: decision.action,
              targetPostId: decision.targetPostId, reason: decision.reason,
            },
          });
          if (result.ok) await refreshThreadsShelf(env);
        }
      }
    }
  } catch (runError) {
    error = runError instanceof Error ? runError.message.slice(0, 200) : 'social_agent_failed';
  }

  const receipt: SocialAgentReceipt = {
    version: 'byeoli-social-agent-v1', runId, at, finishedAt: Date.now(), trigger,
    ok: error === null && account.ok && externalComments.ok && (post.attempted ? post.ok : true)
      && (replies ? replies.ingest.ok : false),
    duplicate: false, account, externalComments, replies, editorial, post,
    continuationNeeded: replies?.continuationNeeded === true,
    continuationDelayMs: replies?.continuationDelayMs ?? null,
    nextLookAt, error,
  };
  await saveReceipt(env, receipt);
  const currentLease = await env.PLANET.get(SOCIAL_LEASE_KEY);
  if (currentLease?.includes(runId)) await env.PLANET.delete(SOCIAL_LEASE_KEY);
  return receipt;
}
