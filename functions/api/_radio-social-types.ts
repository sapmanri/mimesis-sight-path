// 별이 라디오의 공개 참고원 선반 — 읽은 사실과 갱신 영수증만 저장한다.
// 원격 토큰은 절대 KV 선반/응답에 넣지 않는다.

export const THREADS_SHELF_KEY = 'radio:social:threads';
export const THREADS_RECEIPT_KEY = 'radio:social:threads:receipt';
export const YOUTUBE_SHELF_KEY = 'radio:social:youtube';
export const YOUTUBE_RECEIPT_KEY = 'radio:social:youtube:receipt';

export interface ThreadsShelfPost {
  id: string;
  text: string;
  timestamp: string;
  permalink: string;
}

export interface ThreadsShelf {
  username: string;
  profileUrl: string;
  refreshedAt: number;
  posts: ThreadsShelfPost[];
}

export interface YoutubeShelfVideo {
  id: string;
  title: string;
  description: string;
  publishedAt: string;
  url: string;
  thumbnail: string | null;
}

export interface YoutubeShelf {
  handle: string;
  channelId: string;
  channelTitle: string;
  channelUrl: string;
  refreshedAt: number;
  videos: YoutubeShelfVideo[];
}

export interface SocialRefreshReceipt {
  at: number;
  ok: boolean;
  source: 'threads' | 'youtube';
  count: number;
  account: string | null;
  error: string | null;
}
