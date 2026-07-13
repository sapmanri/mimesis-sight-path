from pathlib import Path
import re

path = Path('public/byeoli-walk/index.html')
text = path.read_text(encoding='utf-8')

# The prototype remains a static page, but its inline code becomes an ES module
# so it can consume the shared browser bundle emitted by Vite.
old_script = '<script>\n/* ---- inlined catalog.mjs ---- */'
new_script = """<script type=\"module\">\nimport { HabitEngine, HABIT_BIAS_MAX, capCombinedBias, createLocalHabitStorage } from '/byeoli-walk/brain.js';\n/* ---- inlined catalog.mjs ---- */"""
if old_script in text:
    text = text.replace(old_script, new_script, 1)
elif "from '/byeoli-walk/brain.js'" not in text:
    raise SystemExit('Byeoli Walk script anchor not found')

habit_pattern = re.compile(
    r"const HABIT_BIAS_MAX=0\.15, COMBINED_BIAS_MAX=0\.18;[\s\S]*?\n\};\n\nconst brain=\{",
    re.MULTILINE,
)
habit_replacement = """let loopCount=0;   // 산책 루프 수 = Habit 감쇠의 시간 단위
const habitEngine = new HabitEngine(
  createLocalHabitStorage('mimesis.byeoli.walk.habits.v1')
);

const brain={"""
text, count = habit_pattern.subn(habit_replacement, text, count=1)
if count != 1 and 'new HabitEngine(' not in text:
    raise SystemExit(f'inline HabitEngine block not found: {count}')

text = text.replace(
    'const combined=Math.min(habitBias+personalityBias, COMBINED_BIAS_MAX);',
    'const combined=capCombinedBias(habitBias,personalityBias);',
    1,
)

render_pattern = re.compile(
    r"function renderTaste\(\)\{[\s\S]*?\n\}\n\n/\* =====================================================================\n   UPDATE",
    re.MULTILINE,
)
render_replacement = """function renderTaste(){
  const rows=habitEngine.list(loopCount).filter(r=>r.strength>=0.02);
  const top=rows.slice(0,4);
  if(top.length===0){ tasteHintEl.textContent='— 아직 없음'; tasteListEl.innerHTML=''; return; }
  tasteHintEl.textContent = `취향 ${rows.length}개 형성 중`;
  tasteListEl.innerHTML = top.map(r=>{
    const def=CATALOG[r.targetType]||RARE[r.targetType]||{emoji:'·',ko:r.targetType};
    const decaying = (prevStrength[r.key]!==undefined && r.strength < prevStrength[r.key]-0.001);
    prevStrength[r.key]=r.strength;
    const meta = r.inactiveLoops===0 ? `count ${r.count} · 방금`
      : `count ${r.count} · ${r.inactiveLoops}루프 전${decaying?' · 옅어지는 중':''}`;
    return `<div class=\"trow\">
      <span class=\"tk\"><span class=\"em\">${def.emoji}</span>${def.ko} <span style=\"color:var(--dim)\">${actKo(r.drive)}</span></span>
      <span class=\"ttrack\"><span class=\"tfill ${decaying?'decay':''}\" style=\"width:${(r.strength*100)|0}%\"></span></span>
      <span class=\"tb\">+${r.bias.toFixed(3)}</span>
      <span class=\"tmeta\">${meta}</span>
    </div>`;
  }).join('');
}

/* =====================================================================
   UPDATE"""
text, count = render_pattern.subn(render_replacement, text, count=1)
if count != 1 and 'habitEngine.list(loopCount)' not in text:
    raise SystemExit(f'renderTaste block not found: {count}')

path.write_text(text, encoding='utf-8')
print('Byeoli Walk now consumes the shared HabitEngine browser bundle')
