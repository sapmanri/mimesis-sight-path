import type { ObservationScene } from '../data/jeju';

type StoryCardProps = {
  scene: ObservationScene;
};

export function StoryCard({ scene }: StoryCardProps) {
  return (
    <aside className="story-card" key={scene.id}>
      <p className="story-kicker">{scene.objectLabel}</p>
      <h2>{scene.title}</h2>
      <p>{scene.text}</p>
    </aside>
  );
}
