export const AUTHORITY_SCHEMA_VERSION = 1 as const;

export type RemoteByeoliState = Record<string, unknown>;

export type AuthorityEnvelope<TState = RemoteByeoliState> = {
  schemaVersion: number;
  authorityId: string;
  instanceEpoch: number;
  sequence: number;
  updatedAt: number;
  archiveMode: 'canary' | 'live';
  personalityGrowth: boolean;
  publicationEligible: boolean;
  stale: boolean;
  state: TState;
};

export type AuthorityConnection<TState = RemoteByeoliState> = {
  envelope: AuthorityEnvelope<TState> | null;
  stale: boolean;
  error: string | null;
};

type Listener<TState> = (connection: AuthorityConnection<TState>) => void;

/**
 * BUILD 407-A2
 *
 * 기존 `세상에 발행` 공개 앱과 같은 origin의 `/api/byeoli/state`만 읽는다.
 * 이 객체는 renderer/viewer 전용이다. 로컬 brain, Memory, Habit, world update를
 * 절대 실행하지 않는다.
 */
export class AuthorityPollingClient<TState = RemoteByeoliState> {
  private readonly endpoint: string;
  private readonly intervalMs: number;
  private readonly staleAfterMs: number;
  private timer: number | null = null;
  private requestInFlight = false;
  private lastEnvelope: AuthorityEnvelope<TState> | null = null;
  private listeners = new Set<Listener<TState>>();

  constructor(options?: { endpoint?: string; intervalMs?: number; staleAfterMs?: number }) {
    this.endpoint = options?.endpoint ?? '/api/byeoli/state';
    this.intervalMs = Math.max(500, options?.intervalMs ?? 1_000);
    this.staleAfterMs = Math.max(this.intervalMs * 2, options?.staleAfterMs ?? 5_000);
  }

  subscribe(listener: Listener<TState>): () => void {
    this.listeners.add(listener);
    listener({
      envelope: this.lastEnvelope,
      stale: this.isStale(),
      error: null,
    });
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.timer !== null) return;
    void this.poll();
    this.timer = window.setInterval(() => void this.poll(), this.intervalMs);
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
  }

  current(): AuthorityEnvelope<TState> | null {
    return this.lastEnvelope;
  }

  private isStale(now = Date.now()): boolean {
    return !this.lastEnvelope || now - this.lastEnvelope.updatedAt > this.staleAfterMs;
  }

  private emit(error: string | null): void {
    const connection: AuthorityConnection<TState> = {
      envelope: this.lastEnvelope,
      stale: this.isStale(),
      error,
    };
    for (const listener of this.listeners) listener(connection);
  }

  private validate(value: unknown): AuthorityEnvelope<TState> {
    if (!value || typeof value !== 'object') throw new Error('invalid_authority_envelope');
    const envelope = value as Partial<AuthorityEnvelope<TState>>;
    if (envelope.schemaVersion !== AUTHORITY_SCHEMA_VERSION) throw new Error('authority_schema_mismatch');
    if (typeof envelope.authorityId !== 'string' || envelope.authorityId.length === 0) throw new Error('authority_id_missing');
    if (!Number.isSafeInteger(envelope.instanceEpoch)) throw new Error('authority_epoch_invalid');
    if (!Number.isSafeInteger(envelope.sequence) || (envelope.sequence ?? -1) < 0) throw new Error('authority_sequence_invalid');
    if (typeof envelope.updatedAt !== 'number') throw new Error('authority_updated_at_invalid');
    if (!('state' in envelope)) throw new Error('authority_state_missing');
    return envelope as AuthorityEnvelope<TState>;
  }

  async poll(): Promise<void> {
    if (this.requestInFlight) return;
    this.requestInFlight = true;
    try {
      const response = await fetch(this.endpoint, {
        method: 'GET',
        headers: { accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`authority_http_${response.status}`);
      const incoming = this.validate(await response.json());

      const current = this.lastEnvelope;
      if (current) {
        // 다른 lifecycle로 바뀌었으면 full snapshot으로 교체한다.
        if (incoming.instanceEpoch === current.instanceEpoch && incoming.sequence <= current.sequence) {
          this.emit(null); // 역행·중복 snapshot은 조용히 무시
          return;
        }
      }

      this.lastEnvelope = incoming;
      this.emit(null);
    } catch (error) {
      this.emit(error instanceof Error ? error.message : 'authority_unknown_error');
    } finally {
      this.requestInFlight = false;
    }
  }
}
