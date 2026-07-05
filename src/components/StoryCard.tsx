// ---------- BUILD 099: MEMORY CARD ----------
// 카드는 도착의 것이다. 걷는 동안엔 접혀 있다가, 기억 앞에 서면 조용히 펼쳐진다.
// 에디터에서 첨부한 사진은 여기서 폴라로이드로 처음 살아난다.

import { useEffect, useRef, useState } from 'react';
import type { ObservationScene } from '../data/jeju';

type StoryCardProps = {
  scene: ObservationScene | null;
  mode: 'auto' | 'manual';
};

export function StoryCard({ scene, mode }: StoryCardProps) {
  // 사라질 때도 여운: 마지막 장면을 잠시 붙들고 접힌다
  const [held, setHeld] = useState<ObservationScene | null>(scene);
  // BUILD 108: 타자기 — 도착하면 글이 한 자씩 자리를 잡는다
  const [typed, setTyped] = useState(0);
  const timerRef = useRef<number | null>(null);
  useEffect(() => {
    if (scene) setHeld(scene);
  }, [scene]);
  useEffect(() => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (!scene) return undefined;
    setTyped(0);
    const total = scene.text.length;
    timerRef.current = window.setInterval(() => {
      setTyped((n) => {
        if (n >= total) { if (timerRef.current) window.clearInterval(timerRef.current); return n; }
        return n + 1;
      });
    }, 34);
    return () => { if (timerRef.current) window.clearInterval(timerRef.current); };
  }, [scene]);
  const open = !!scene;
  if (!held) return null;
  const shown = open ? held.text.slice(0, typed) : held.text;
  const typing = open && typed < held.text.length;

  return (
    <aside className={open ? 'memory-card open' : 'memory-card'} data-mode={mode} aria-hidden={!open}>
      {held.photo && (
        <figure className="memory-photo">
          <img src={held.photo} alt={held.title} />
        </figure>
      )}
      <div className="memory-body">
        <p className="memory-kicker">
          <span className="memory-emoji">{held.emoji}</span>
          {held.objectLabel}
        </p>
        <h2>{held.title}</h2>
        <p className="memory-text">
          {shown}
          {typing && <span className="memory-caret">▎</span>}
        </p>
      </div>
    </aside>
  );
}
