import type { ObservationScene } from '../data/jeju';

type ParallaxLayersProps = {
  activeIndex: number;
  scene: ObservationScene;
};

const layerSets = [
  { sky: 'sky-fog', land: 'village', near: 'moss' },
  { sky: 'sky-soft', land: 'road', near: 'grass' },
  { sky: 'sky-soft', land: 'bridge', near: 'wood' },
  { sky: 'sky-clear', land: 'wing', near: 'cloud' },
  { sky: 'sky-cloud', land: 'open', near: 'mist' },
  { sky: 'sky-clear', land: 'stonewall', near: 'grass' },
  { sky: 'sky-sunset', land: 'flowerwall', near: 'grass' },
  { sky: 'sky-sea', land: 'cliff', near: 'foam' },
  { sky: 'sky-clear', land: 'sand', near: 'grass' },
  { sky: 'sky-night', land: 'room', near: 'dust' },
  { sky: 'sky-fog', land: 'fogroad', near: 'mist' },
  { sky: 'sky-night', land: 'library', near: 'dust' },
  { sky: 'sky-cloud', land: 'open', near: 'light' },
];

export function ParallaxLayers({ activeIndex, scene }: ParallaxLayersProps) {
  const set = layerSets[activeIndex % layerSets.length];
  const drift = activeIndex * -18;
  const atmosphere = getAtmosphere(scene.weather);

  return (
    <div className={`parallax-scene ${atmosphere}`} aria-hidden="true">
      <div className={`parallax-layer layer-sky ${set.sky}`} style={{ transform: `translate3d(${drift * 0.12}px, ${activeIndex * -3}px, 0)` }} />
      <div className="parallax-layer layer-haze" />
      <div className={`parallax-layer layer-far ${set.land}`} style={{ transform: `translate3d(${drift * 0.26}px, ${activeIndex * -5}px, 0)` }} />
      <div className={`parallax-layer layer-mid ${set.land}`} style={{ transform: `translate3d(${drift * 0.48}px, ${activeIndex * -7}px, 0)` }} />
      <div className={`parallax-layer layer-near ${set.near}`} style={{ transform: `translate3d(${drift * 0.78}px, ${activeIndex * -9}px, 0)` }} />
      <div className="parallax-layer layer-vignette" />
    </div>
  );
}

function getAtmosphere(weather: ObservationScene['weather']) {
  if (weather === 'fog-morning') return 'atmosphere-fog';
  if (weather === 'moon-night') return 'atmosphere-night';
  if (weather === 'sunset-fade') return 'atmosphere-sunset';
  if (weather === 'clear-day') return 'atmosphere-clear';
  return 'atmosphere-soft';
}
