from pathlib import Path

life = Path('src/life/lifeArchive.ts')
s = life.read_text()
imp = "import type { PlanetEvent } from '../scene/planetEvents';\n"
new_imp = imp + "import { saveBecomingByeoli } from './becomingByeoli';\n"
if "saveBecomingByeoli" not in s:
    if imp not in s:
        raise SystemExit('lifeArchive import anchor not found')
    s = s.replace(imp, new_imp, 1)

old = "  const archive = immutableAppend(loadLifeArchive(), memory);\n  saveLifeArchive(archive);\n  window.dispatchEvent(new CustomEvent('mimesis:memory-created', { detail: memory }));\n"
new = "  const archive = immutableAppend(loadLifeArchive(), memory);\n  saveLifeArchive(archive);\n  // BUILD 403: 원본 Memory를 건드리지 않고 반복에서 별이다움을 다시 계산한다.\n  saveBecomingByeoli(archive.memories);\n  window.dispatchEvent(new CustomEvent('mimesis:memory-created', { detail: memory }));\n"
if old not in s:
    raise SystemExit('remember save anchor not found')
s = s.replace(old, new, 1)
life.write_text(s)

app = Path('src/App.tsx')
a = app.read_text()
import re
pattern = r"const BUILD_LABEL = 'v2\\.\\d+\\.\\d+ · BUILD \\d+ · [^']+';"
replacement = "const BUILD_LABEL = 'v2.54.0 · BUILD 403 · Becoming Byeoli — 별이는 조금씩 별이가 되어갑니다';"
next_a, n = re.subn(pattern, replacement, a, count=1)
if n != 1:
    raise SystemExit('BUILD_LABEL anchor not found')
app.write_text(next_a)
