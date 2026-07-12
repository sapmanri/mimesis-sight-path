from pathlib import Path
import re

path = Path('src/scene/PlanetWorld.tsx')
text = path.read_text(encoding='utf-8')

old_import = "import { ROAMING_ANIMALS, animalTemperament, chooseAnimalGoal, makeAnimalState, mapAnimalClips, playAnimalMode, type AnimalLifeState } from '../mimesis/runtime';"
new_import = "import { ROAMING_ANIMALS, animalTemperament, attachHandProp, chooseAnimalGoal, makeAnimalState, mapAnimalClips, playAnimalMode, type AnimalLifeState } from '../mimesis/runtime';"
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif new_import not in text:
    raise SystemExit('MIMESIS runtime import anchor not found')

pattern = re.compile(
    r"      // BUILD 399: 랜턴이 안정적으로 달린 바로 그 오른손/손목 앵커를 카메라와 휴대폰도 공유한다\.[\s\S]*?"
    r"      \}\n    \}\)\.catch\(\(\) => \{ /\* 조용한 행성 \*/ \}\);",
    re.MULTILINE,
)

replacement = """      // BUILD 404: 랜턴·카메라·휴대폰은 MIMESIS 공통 손목 마운트만 사용한다.
      // 손뼈 탐색·월드 스케일 상쇄·소품별 자세는 handMount.ts의 단일 기준값이다.
      const mountHeldDevice = (kind: 'camera' | 'phone') => {
        void loadHeldDeviceAsset(kind).then((device) => {
          if (!alive) return;
          const mount = attachHandProp(group, device, kind, 'right');
          if (!mount) return;
          mount.visible = false;
          if (kind === 'camera') heldCameraRef.current = mount;
          else heldPhoneRef.current = mount;
        }).catch(() => { /* 소품이 없으면 동작만 유지 */ });
      };
      mountHeldDevice('camera');
      mountHeldDevice('phone');

      if (lanternOnRef.current) {
        void loadHandLanternAsset().then((lantern) => {
          if (!alive) return;
          const mount = attachHandProp(group, lantern, 'lantern', 'right');
          if (!mount) return;
          mount.visible = false; // 밤에만 프레임 루프에서 켠다.
          lanternRef.current = mount;
        }).catch(() => { /* 랜턴 없으면 조용히 */ });
      }
    }).catch(() => { /* 조용한 행성 */ });"""

text, count = pattern.subn(replacement, text, count=1)
if count != 1:
    raise SystemExit(f'hand mount migration block not found: {count}')

# 폐기된 월드 추적 코드는 더 이상 실행하지 않는다. refs는 호환을 위해 남겨둔다.
tracking = re.compile(
    r"    // BUILD 398의 월드 추적은 폐기\.[\s\S]*?"
    r"      heldHand\.getWorldQuaternion\(heldRoot\.quaternion\);\n"
    r"    \}\n",
    re.MULTILINE,
)
text = tracking.sub("    // BUILD 404: 손 소품은 손뼈 자식이므로 별도 월드 추적이 필요 없다.\n", text, count=1)

path.write_text(text, encoding='utf-8')
print('BUILD 404 shared hand mount migration applied')
