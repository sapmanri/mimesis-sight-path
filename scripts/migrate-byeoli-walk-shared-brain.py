from pathlib import Path

path = Path('public/byeoli-walk/index.html')
text = path.read_text(encoding='utf-8')

old_import = "import { HabitEngine, HABIT_BIAS_MAX, capCombinedBias, createLocalHabitStorage } from '/byeoli-walk/brain.js';"
new_import = "import { HABIT_BIAS_MAX, capCombinedBias, createSharedHabitEngine, byeoliDayEpoch, formatByeoliDate } from '/byeoli-walk/brain.js';"
if old_import in text:
    text = text.replace(old_import, new_import, 1)
elif new_import not in text:
    raise SystemExit('shared brain import anchor not found')

old_engine = """let loopCount=0;   // 산책 루프 수 = Habit 감쇠의 시간 단위
const habitEngine = new HabitEngine(
  createLocalHabitStorage('mimesis.byeoli.walk.habits.v1')
);"""
new_engine = """let loopCount=0;   // 2D 산책 연출용 루프 수(취향 시간과 분리)
const habitEpoch=()=>byeoliDayEpoch();
const habitEngine=createSharedHabitEngine(habitEpoch());"""
if old_engine in text:
    text = text.replace(old_engine, new_engine, 1)
elif 'createSharedHabitEngine(' not in text:
    raise SystemExit('2D HabitEngine construction anchor not found')

text = text.replace('habitEngine.bias(type,d,loopCount)', 'habitEngine.bias(type,d,habitEpoch())')
text = text.replace('habitEngine.record(type,best,loopCount)', 'habitEngine.record(type,best,habitEpoch())')
text = text.replace('habitEngine.list(loopCount)', 'habitEngine.list(habitEpoch())')
text = text.replace("${r.inactiveLoops}루프 전", "${r.inactiveLoops}별이일 전")

# Observatory에서 현재 공통 별이력도 확인할 수 있게 취향 헤더에 표시한다.
old_hint = "tasteHintEl.textContent = `취향 ${rows.length}개 형성 중`;"
new_hint = "tasteHintEl.textContent = `${formatByeoliDate()} · 취향 ${rows.length}개 형성 중`;"
if old_hint in text:
    text = text.replace(old_hint, new_hint, 1)

path.write_text(text, encoding='utf-8')
print('Byeoli Walk now shares Habit storage and Byeoli calendar with 3D')
