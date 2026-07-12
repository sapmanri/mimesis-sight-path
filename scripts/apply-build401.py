from pathlib import Path

# byeoliDrive: stimuli now come from the Interaction Library.
p = Path('src/scene/byeoliDrive.ts')
s = p.read_text()
if "../life/interactionLibrary" not in s:
    s = s.replace("// 행동 실행과 목적지 이동은 PlanetWorld가 계속 소유한다.\n", "// 행동 실행과 목적지 이동은 PlanetWorld가 계속 소유한다.\n\nimport { getAttractableStimuli, type InteractionStimulus } from '../life/interactionLibrary';\n")
s = s.replace("export type DriveStimulus = Partial<Record<Drive, number>>;", "export type DriveStimulus = InteractionStimulus;")
start = s.index("export const PROP_STIMULUS: Record<string, {")
end = s.index("\n\nexport function tickDrives", start)
s = s[:start] + "export const PROP_STIMULUS: Record<string, {\n  radius: number;\n  atten: number;\n  stir: DriveStimulus;\n}> = getAttractableStimuli();" + s[end:]
p.write_text(s)

# Planet event schema: interaction is now a first-class life event.
p = Path('src/scene/planetEvents.ts')
s = p.read_text()
s = s.replace("  | 'campfire';      // 모닥불 앞에 쉬어갔다", "  | 'campfire'       // 모닥불 앞에 쉬어갔다\n  | 'interaction';   // BUILD 401: 오브젝트와 실제로 만났다")
s = s.replace("data?: { country?: string; kind?: string; meters?: number; seconds?: number; phase?: string; km?: number; village?: string; stage?: string; memory?: string };", "data?: { country?: string; kind?: string; meters?: number; seconds?: number; phase?: string; km?: number; village?: string; stage?: string; memory?: string; object?: string; objectId?: string; label?: string; seeds?: string[]; interactionPhase?: 'start' | 'end' };")
p.write_text(s)

# Timeline: interactions become readable journal lines.
p = Path('src/planet/timeline.ts')
s = p.read_text()
needle = "    case 'campfire':\n      return { id, icon: '🔥', text: '모닥불 앞에 앉아 잠시 쉬어갔다', t: e.t, kind: e.kind };"
replacement = needle + "\n    case 'interaction': {\n      const label = e.data?.label ?? e.data?.object ?? '무언가';\n      const phase = e.data?.interactionPhase ?? 'start';\n      return { id, icon: '🌱', text: phase === 'start' ? `별이는 ${label} 앞에 멈춰 섰다` : `별이는 ${label} 곁에서 다시 길을 나섰다`, t: e.t, kind: `${e.kind}_${e.data?.objectId ?? label}_${phase}` };\n    }"
if needle not in s:
    raise SystemExit('timeline campfire anchor not found')
s = s.replace(needle, replacement, 1)
p.write_text(s)

# Life Archive: use the actual object as Object History target.
p = Path('src/life/lifeArchive.ts')
s = p.read_text()
s = s.replace("const target = event.data?.country ?? event.data?.village ?? event.data?.memory ?? event.data?.stage ?? event.data?.kind ?? null;", "const target = event.data?.object ?? event.data?.country ?? event.data?.village ?? event.data?.memory ?? event.data?.stage ?? event.data?.kind ?? null;")
p.write_text(s)

# PlanetWorld: consume the library for approach, distance, and archived interaction events.
p = Path('src/scene/PlanetWorld.tsx')
s = p.read_text()
import_anchor = "import { beginRising, beginStanding, createEncounter, shouldEndEncounter, type ByeoliEncounter } from './byeoliEncounter';"
if "interactionLibrary" not in s:
    s = s.replace(import_anchor, import_anchor + "\nimport { getInteraction, interactionApproachText, interactionObservationText } from '../life/interactionLibrary';")

old = """            attractTarget.current = createEncounter(pick.d, pick.id, pick.radius);\n            narrate(`별이는 ${propNarrationName(pick.id)} 쪽으로 천천히 발걸음을 옮겼다.`);"""
new = """            attractTarget.current = createEncounter(pick.d, pick.id, pick.radius);\n            const pickedObject = SP.props.find((pr) => pr.id === pick.id)?.obj ?? 'unknown';\n            narrate(interactionApproachText(pickedObject));"""
if old not in s:
    raise SystemExit('approach anchor not found')
s = s.replace(old, new, 1)

old = """            const arrivalAngleByObject: Record<string, number> = {\n              book: 0.034,\n              'rock-small': 0.034,\n              chair: 0.042,\n              tree: 0.055,\n              'rock-big': 0.06,\n              lighthouse: 0.085,\n            };\n            const arrivalAngle = arrivalAngleByObject[targetProp?.obj ?? ''] ?? 0.05;"""
new = """            const interaction = getInteraction(targetProp?.obj ?? 'unknown');\n            const arrivalAngle = interaction.arrivalAngle;"""
if old not in s:
    raise SystemExit('arrival angle anchor not found')
s = s.replace(old, new, 1)

old = """              T2.arrived = true;\n              const r = chooseAndActByDrive(T2); T2.step = r.dur; T2.wasSustained = r.sustained;"""
new = """              T2.arrived = true;\n              narrate(interactionObservationText(targetProp?.obj ?? 'unknown'));\n              emit('interaction', {\n                object: targetProp?.obj ?? 'unknown', objectId: T2.id, label: interaction.label,\n                seeds: interaction.seeds, interactionPhase: 'start',\n              });\n              const r = chooseAndActByDrive(T2); T2.step = r.dur; T2.wasSustained = r.sustained;"""
if old not in s:
    raise SystemExit('arrival action anchor not found')
s = s.replace(old, new, 1)

old = """            attractCooldown.current.set(T2.id, 25); // 방금 논 소품 25초 억제(반복 방지)\n            narrate(`별이는 ${propNarrationName(T2.id)} 곁에 충분히 머문 뒤, 다시 길을 나섰다.`);\n            attractTarget.current = null;"""
new = """            attractCooldown.current.set(T2.id, 25); // 방금 논 소품 25초 억제(반복 방지)\n            const finishedProp = SP.props.find((pr) => pr.id === T2.id);\n            const finishedInteraction = getInteraction(finishedProp?.obj ?? 'unknown');\n            narrate(`별이는 ${finishedInteraction.label} 곁에 충분히 머문 뒤, 다시 길을 나섰다.`);\n            emit('interaction', {\n              object: finishedProp?.obj ?? 'unknown', objectId: T2.id, label: finishedInteraction.label,\n              seeds: finishedInteraction.seeds, interactionPhase: 'end',\n            });\n            attractTarget.current = null;"""
if old not in s:
    raise SystemExit('finish interaction anchor not found')
s = s.replace(old, new, 1)
p.write_text(s)

# App build label.
p = Path('src/App.tsx')
s = p.read_text()
s = s.replace("const BUILD_LABEL = 'v2.51.0 · BUILD 400 · Life Archive — 별이는 오늘부터 하루를 기록하기 시작합니다';", "const BUILD_LABEL = 'v2.52.0 · BUILD 401 · Interaction Library — 사물마다 행동의 씨앗이 생겼습니다';")
p.write_text(s)
