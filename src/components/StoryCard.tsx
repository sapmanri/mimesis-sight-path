import type { ObservationScene } from '../data/jeju';

type StoryCardProps = {
  scene: ObservationScene;
  mode: 'auto' | 'manual';
};

export function StoryCard({ scene, mode }: StoryCardProps) {
  return (
    <aside className="story-card" key={scene.id} data-mode={mode}>
      <p className="story-kicker">{scene.objectLabel}</p>
      <h2>{scene.title}</h2>
      <p>{scene.text}</p>
    </aside>
  );
}
