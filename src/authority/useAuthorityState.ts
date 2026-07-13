import { useEffect, useMemo, useState } from 'react';
import {
  AuthorityPollingClient,
  type AuthorityConnection,
  type RemoteByeoliState,
} from './remoteState';

export type UseAuthorityStateOptions = {
  enabled: boolean;
  endpoint?: string;
  intervalMs?: number;
  staleAfterMs?: number;
};

/**
 * BUILD 407-A4
 *
 * React/Three.js viewer가 Single Byeoli Authority를 읽기 위한 공용 hook.
 * 상태를 생성하거나 진행하지 않는다. 오직 같은 origin의 authoritative snapshot을
 * 구독하고, 마지막 정상 snapshot과 stale/error 상태를 돌려준다.
 */
export function useAuthorityState<TState = RemoteByeoliState>({
  enabled,
  endpoint = '/api/byeoli/state',
  intervalMs = 1_000,
  staleAfterMs = 5_000,
}: UseAuthorityStateOptions): AuthorityConnection<TState> {
  const client = useMemo(
    () => new AuthorityPollingClient<TState>({ endpoint, intervalMs, staleAfterMs }),
    [endpoint, intervalMs, staleAfterMs],
  );

  const [connection, setConnection] = useState<AuthorityConnection<TState>>({
    envelope: null,
    stale: true,
    error: null,
  });

  useEffect(() => {
    if (!enabled) {
      client.stop();
      setConnection({ envelope: null, stale: true, error: null });
      return undefined;
    }

    const unsubscribe = client.subscribe(setConnection);
    client.start();

    return () => {
      unsubscribe();
      client.stop();
    };
  }, [client, enabled]);

  return connection;
}
