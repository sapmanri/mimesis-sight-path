import { calculateDwellMs } from './dwellDirector';
import type { ObjectKit, PathSegmentKind, SurfaceState, WeatherState } from './pathPresets';

export type CameraShot = 'wide' | 'macro' | 'walk' | 'overhead' | 'side';

export type SceneBlueprint = {
  id: number;
  title: string;
  objectLabel: string;
  emoji: string;
  text: string;
  position: [number, number, number];
  scale: number;
  hue: string;
  objectKit: ObjectKit;
  pathKind: PathSegmentKind;
  surface: SurfaceState;
  weather: WeatherState;
  cameraShot: CameraShot;
  importance: number;
  stillness: number;
  soundTone: number;
  /** BUILD 096: 에디터에서 첨부한 사진 (dataURL 또는 URL) — 폴라로이드 액자(예정)용 */
  photo?: string;
};

export type RuntimeScene = SceneBlueprint & {
  dwellMs: number;
};

export function compileScenes(blueprints: SceneBlueprint[]): RuntimeScene[] {
  return blueprints.map((scene) => ({
    ...scene,
    dwellMs: calculateDwellMs({
      text: scene.text,
      importance: scene.importance,
      stillness: scene.stillness,
      shotType: scene.cameraShot,
    }),
  }));
}
