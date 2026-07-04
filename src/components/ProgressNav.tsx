import type { ObservationScene } from '../data/jeju';

type ProgressNavProps = {
  scenes: ObservationScene[];
  activeIndex: number;
  onChange: (index: number) => void;
};

export function ProgressNav({ scenes, activeIndex, onChange }: ProgressNavProps) {
  return (
    <nav className="progress-nav" aria-label="Observation path">
      {scenes.map((scene, index) => (
        <button
          key={scene.id}
          className={index === activeIndex ? 'active' : ''}
          onClick={() => onChange(index)}
          aria-label={scene.title}
        >
          <span />
          <small>{scene.title}</small>
        </button>
      ))}
    </nav>
  );
}
