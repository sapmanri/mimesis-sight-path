from pathlib import Path

path = Path('src/scene/PlanetWorld.tsx')
text = path.read_text(encoding='utf-8')

import_anchor = "import { getInteraction, interactionApproachText, interactionObservationText } from '../life/interactionLibrary';\n"
import_repl = import_anchor + "import { recordPlanetHabitShadow } from '../brain/planetHabitShadow';\n"
if "recordPlanetHabitShadow" not in text:
    if import_anchor not in text:
        raise SystemExit('interactionLibrary import anchor not found')
    text = text.replace(import_anchor, import_repl, 1)

switch_anchor = """      default: r = doObserve(); D.observe = Math.max(0, D.observe - 0.5); break;\n    }\n    return r;\n"""
switch_repl = """      default: r = doObserve(); D.observe = Math.max(0, D.observe - 0.5); break;\n    }\n    // BUILD 405-D1 Shadow Mode: successful 3D actions build Habit state,\n    // but the calculated bias is deliberately NOT applied to chooseDrive yet.\n    if (propObj) recordPlanetHabitShadow(propObj, best);\n    return r;\n"""
if "BUILD 405-D1 Shadow Mode" not in text:
    if switch_anchor not in text:
        raise SystemExit('chooseAndAct switch anchor not found')
    text = text.replace(switch_anchor, switch_repl, 1)

path.write_text(text, encoding='utf-8')
