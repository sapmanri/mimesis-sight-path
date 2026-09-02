import { ppaekkongCoreState } from '../_ppaekkong-core.ts';

export const onRequestGet: PagesFunction = async () =>
  new Response(JSON.stringify(ppaekkongCoreState()), {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'access-control-allow-origin': '*',
    },
  });
