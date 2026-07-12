from pathlib import Path
import re

# 1) Build label: one stable manifest, no future App.tsx string patches.
app = Path('src/App.tsx')
s = app.read_text()
if "from './build/current'" not in s:
    imports = list(re.finditer(r"^import .*?;\n", s, flags=re.M))
    if not imports:
        raise SystemExit('App import section not found')
    at = imports[-1].end()
    s = s[:at] + "import { BUILD_LABEL } from './build/current';\n" + s[at:]
s, removed = re.subn(r"^const BUILD_LABEL\s*=\s*'[^']*';\n", "", s, count=1, flags=re.M)
if removed != 1 and "import { BUILD_LABEL } from './build/current';" not in s:
    raise SystemExit('App BUILD_LABEL migration failed')
app.write_text(s)

# 2) Life Archive: derived behavior goes through a registry, not direct imports.
life = Path('src/life/lifeArchive.ts')
s = life.read_text()
s = s.replace("import { saveBecomingByeoli } from './becomingByeoli';\n", "import { runMemoryProcessors } from '../mimesis/runtime';\n")
s = s.replace("  saveBecomingByeoli(archive.memories);", "  runMemoryProcessors(archive.memories, memory);")
if "runMemoryProcessors(archive.memories, memory);" not in s:
    raise SystemExit('Life pipeline migration failed')
life.write_text(s)

# 3) PlanetWorld depends on the stable MIMESIS facade, not implementation files.
planet = Path('src/scene/PlanetWorld.tsx')
s = planet.read_text()
s = re.sub(
    r"import \{ ROAMING_ANIMALS, animalTemperament, chooseAnimalGoal, makeAnimalState, mapAnimalClips, playAnimalMode, type AnimalLifeState \} from '../life/animalLife';",
    "import { ROAMING_ANIMALS, animalTemperament, chooseAnimalGoal, makeAnimalState, mapAnimalClips, playAnimalMode, type AnimalLifeState } from '../mimesis/runtime';",
    s,
    count=1,
)
if "from '../mimesis/runtime';" not in s:
    raise SystemExit('Planet runtime facade migration failed')
planet.write_text(s)

# Failed BUILD 404 staging is retired. The repaired motion build will target modules only.
for path in [
    Path('.github/workflows/apply-build404.yml'),
    Path('scripts/apply-build404.py'),
    Path('.build404-trigger'),
]:
    if path.exists():
        path.unlink()
