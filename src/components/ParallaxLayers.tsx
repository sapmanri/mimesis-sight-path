import type { ObservationScene } from '../data/jeju';

type ParallaxLayersProps = {
  activeIndex: number;
  scene: ObservationScene;
};

const layerSets = [
  { sky: 'sky-clear', land: 'mountain', near: 'cloud' },
  { sky: 'sky-soft', land: 'mountain', near: 'grass' },
  { sky: 'sky-cloud', land: 'mountain', near: 'cloud' },
  { sky: 'sky-clear', land: 'ridge', near: 'cloud' },
  { sky: 'sky-soft', land: 'ridge', near: 'grass' },
  { sky: 'sky-clear', land: 'mountain', near: 'grass' },
  { sky: 'sky-cloud', land: 'ridge', near: 'cloud' },
  { sky: 'sky-sea', land: 'cliff', near: 'foam' },
  { sky: 'sky-clear', land: 'mountain', near: 'grass' },
  { sky: 'sky-night', land: 'ridge', near: 'dust' },
  { sky: 'sky-soft', land: 'mountain', near: 'cloud' },
  { sky: 'sky-night', land: 'ridge', near: 'dust' },
  { sky: 'sky-cloud', land: 'mountain', near: 'cloud' },
];

export function ParallaxLayers({ activeIndex, scene }: ParallaxLayersProps) {
  const set = layerSets[activeIndex % layerSets.length];
  const drift = activeIndex * -18;
  const atmosphere = getAtmosphere(scene.weather);

  return (
    <div className={`parallax-scene ${atmosphere}`} aria-hidden="true">
      <div className={`parallax-layer layer-sky ${set.sky}`} style={{ transform: `translate3d(${drift * 0.1}px, ${activeIndex * -2}px, 0)` }} />
      <div className={`parallax-layer layer-far ${set.land}`} style={{ transform: `translate3d(${drift * 0.22}px, ${activeIndex * -4}px, 0)` }} />
      <div className={`parallax-layer layer-mid ${set.land}`} style={{ transform: `translate3d(${drift * 0.38}px, ${activeIndex * -6}px, 0)` }} />
      <div className={`parallax-layer layer-near ${set.near}`} style={{ transform: `translate3d(${drift * 0.62}px, ${activeIndex * -7}px, 0)` }} />
    </div>
  );
}

function getAtmosphere(weather: ObservationScene['weather']) {
  if (weather === 'moon-night') return 'atmosphere-night';
  if (weather === 'sunset-fade') return 'atmosphere-sunset';
  if (weather === 'clear-day') return 'atmosphere-clear';
  return 'atmosphere-soft';
}
