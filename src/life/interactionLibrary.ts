// BUILD 401: Interaction Library
// 오브젝트는 각본이 아니라 행동 씨앗을 제공한다. 별이는 현재 욕구와 상황으로 씨앗을 고른다.

export type InteractionDrive = 'observe' | 'record' | 'rest' | 'wonder';
export type InteractionStimulus = Partial<Record<InteractionDrive, number>>;
export type InteractionSeed =
  | 'look' | 'touch' | 'sit' | 'lean' | 'read' | 'write' | 'photograph'
  | 'listen' | 'smell' | 'wait' | 'circle' | 'greet' | 'follow' | 'play'
  | 'rest' | 'wonder';

export type InteractionDefinition = {
  object: string;
  label: string;
  family: 'nature' | 'structure' | 'memory' | 'animal' | 'person' | 'sky' | 'vehicle' | 'unknown';
  radius: number;
  atten: number;
  arrivalAngle: number;
  stir: InteractionStimulus;
  seeds: InteractionSeed[];
  approach: string[];
  observe: string[];
};

const define = (d: InteractionDefinition): InteractionDefinition => d;

export const INTERACTION_LIBRARY: Record<string, InteractionDefinition> = {
  chair: define({ object: 'chair', label: '의자', family: 'structure', radius: 0.9, atten: 1.4, arrivalAngle: 0.042, stir: { observe: 0.5, rest: 0.8, wonder: 0.2 }, seeds: ['look', 'touch', 'sit', 'rest', 'write'], approach: ['별이는 의자를 발견하고 천천히 가까이 갔다.', '잠시 앉아도 될 것 같은 자리가 보였다.'], observe: ['별이는 의자의 빈 자리를 한동안 바라보았다.'] }),
  book: define({ object: 'book', label: '책', family: 'memory', radius: 0.9, atten: 1.6, arrivalAngle: 0.034, stir: { observe: 0.7, record: 0.8, rest: 0.3 }, seeds: ['look', 'touch', 'read', 'write', 'photograph'], approach: ['별이는 책이 놓인 곳으로 발걸음을 옮겼다.'], observe: ['별이는 책등을 따라 천천히 시선을 움직였다.'] }),
  tree: define({ object: 'tree', label: '나무', family: 'nature', radius: 0.85, atten: 1.1, arrivalAngle: 0.055, stir: { observe: 0.6, wonder: 0.5, record: 0.3, rest: 0.2 }, seeds: ['look', 'touch', 'lean', 'listen', 'photograph', 'rest'], approach: ['별이는 나무 그늘 쪽으로 천천히 걸어갔다.'], observe: ['별이는 잎 사이를 지나는 바람을 바라보았다.'] }),
  'rock-small': define({ object: 'rock-small', label: '작은 바위', family: 'nature', radius: 0.85, atten: 1.5, arrivalAngle: 0.034, stir: { observe: 0.7, wonder: 0.3 }, seeds: ['look', 'touch', 'sit', 'circle', 'photograph'], approach: ['별이는 작은 바위 앞에서 걸음을 늦췄다.'], observe: ['별이는 바위 표면의 무늬를 들여다보았다.'] }),
  'rock-big': define({ object: 'rock-big', label: '큰 바위', family: 'nature', radius: 0.9, atten: 1, arrivalAngle: 0.06, stir: { wonder: 0.7, observe: 0.5, rest: 0.2 }, seeds: ['look', 'touch', 'lean', 'circle', 'rest', 'photograph'], approach: ['별이는 커다란 바위 쪽으로 천천히 다가갔다.'], observe: ['별이는 바위가 지나온 시간을 상상해 보았다.'] }),
  lighthouse: define({ object: 'lighthouse', label: '등대', family: 'structure', radius: 1, atten: 0.6, arrivalAngle: 0.085, stir: { wonder: 0.9, record: 0.4, observe: 0.4 }, seeds: ['look', 'wait', 'circle', 'photograph', 'wonder'], approach: ['별이는 멀리 보이는 등대를 향해 걸었다.'], observe: ['별이는 등대의 빛이 돌아오기를 기다렸다.'] }),
  bush: define({ object: 'bush', label: '수풀', family: 'nature', radius: 0.72, atten: 1.5, arrivalAngle: 0.045, stir: { observe: 0.6, wonder: 0.3 }, seeds: ['look', 'listen', 'touch', 'photograph'], approach: ['수풀 안쪽에서 작은 움직임이 느껴졌다.'], observe: ['별이는 수풀의 소리에 귀를 기울였다.'] }),
  grass: define({ object: 'grass', label: '풀', family: 'nature', radius: 0.65, atten: 1.7, arrivalAngle: 0.035, stir: { observe: 0.5, rest: 0.2 }, seeds: ['look', 'touch', 'smell', 'photograph'], approach: ['별이는 풀잎이 흔들리는 곳에 멈췄다.'], observe: ['별이는 손끝으로 풀의 결을 느꼈다.'] }),
  lantern: define({ object: 'lantern', label: '랜턴', family: 'structure', radius: 0.78, atten: 1.2, arrivalAngle: 0.04, stir: { observe: 0.4, wonder: 0.6, rest: 0.2 }, seeds: ['look', 'touch', 'wait', 'photograph'], approach: ['별이는 작은 불빛 쪽으로 걸어갔다.'], observe: ['별이는 랜턴 안의 빛을 오래 바라보았다.'] }),
  streetlamp: define({ object: 'streetlamp', label: '가로등', family: 'structure', radius: 0.82, atten: 1, arrivalAngle: 0.06, stir: { wonder: 0.5, rest: 0.3, observe: 0.3 }, seeds: ['look', 'wait', 'lean', 'photograph'], approach: ['별이는 가로등 아래의 밝은 자리를 향했다.'], observe: ['별이는 빛과 그림자의 경계를 바라보았다.'] }),
  cup: define({ object: 'cup', label: '찻잔', family: 'memory', radius: 0.68, atten: 1.8, arrivalAngle: 0.03, stir: { observe: 0.5, rest: 0.6, record: 0.2 }, seeds: ['look', 'touch', 'smell', 'sit', 'write'], approach: ['별이는 찻잔이 놓인 자리로 다가갔다.'], observe: ['별이는 식어 가는 찻잔 곁에 잠시 머물렀다.'] }),
  suitcase: define({ object: 'suitcase', label: '캐리어', family: 'memory', radius: 0.78, atten: 1.3, arrivalAngle: 0.045, stir: { wonder: 0.5, record: 0.4, observe: 0.4 }, seeds: ['look', 'touch', 'wait', 'photograph', 'wonder'], approach: ['별이는 오래된 여행 가방을 발견했다.'], observe: ['별이는 닫힌 가방 안의 여행을 상상했다.'] }),
  'cd-shelf': define({ object: 'cd-shelf', label: 'CD 선반', family: 'memory', radius: 0.78, atten: 1.4, arrivalAngle: 0.045, stir: { observe: 0.5, record: 0.5, rest: 0.2 }, seeds: ['look', 'touch', 'listen', 'write'], approach: ['별이는 낡은 음반들이 있는 쪽으로 다가갔다.'], observe: ['별이는 들리지 않는 노래를 잠시 떠올렸다.'] }),
  rabbit: define({ object: 'rabbit', label: '토끼', family: 'animal', radius: 0.82, atten: 1.5, arrivalAngle: 0.06, stir: { observe: 0.7, wonder: 0.7 }, seeds: ['look', 'greet', 'follow', 'play', 'photograph'], approach: ['별이는 토끼를 놀라게 하지 않도록 천천히 다가갔다.'], observe: ['별이는 토끼의 작은 움직임을 지켜보았다.'] }),
  dog: define({ object: 'dog', label: '강아지', family: 'animal', radius: 0.9, atten: 1.3, arrivalAngle: 0.065, stir: { observe: 0.5, wonder: 0.5, rest: 0.2 }, seeds: ['look', 'greet', 'touch', 'follow', 'play'], approach: ['별이는 강아지에게 천천히 인사하러 갔다.'], observe: ['별이는 강아지와 눈을 맞췄다.'] }),
  duck: define({ object: 'duck', label: '오리', family: 'animal', radius: 0.82, atten: 1.4, arrivalAngle: 0.06, stir: { observe: 0.7, wonder: 0.4 }, seeds: ['look', 'follow', 'listen', 'photograph'], approach: ['별이는 뒤뚱거리는 오리를 따라갔다.'], observe: ['별이는 오리가 지나간 자리를 바라보았다.'] }),
  cow: define({ object: 'cow', label: '소', family: 'animal', radius: 0.95, atten: 1, arrivalAngle: 0.08, stir: { observe: 0.5, wonder: 0.4, rest: 0.2 }, seeds: ['look', 'greet', 'touch', 'wait', 'photograph'], approach: ['별이는 풀을 뜯는 소 곁으로 다가갔다.'], observe: ['별이는 소의 느린 호흡을 바라보았다.'] }),
  deer: define({ object: 'deer', label: '사슴', family: 'animal', radius: 0.95, atten: 0.9, arrivalAngle: 0.09, stir: { observe: 0.8, wonder: 0.8 }, seeds: ['look', 'wait', 'follow', 'photograph'], approach: ['별이는 사슴과 거리를 둔 채 천천히 다가갔다.'], observe: ['별이는 사슴이 먼저 움직일 때까지 기다렸다.'] }),
  moon: define({ object: 'moon', label: '달', family: 'sky', radius: 1.1, atten: 0.5, arrivalAngle: 0.12, stir: { wonder: 1, record: 0.4, observe: 0.5 }, seeds: ['look', 'wait', 'write', 'photograph', 'wonder'], approach: ['별이는 달이 잘 보이는 곳을 찾아 걸었다.'], observe: ['별이는 달이 조금 움직일 때까지 바라보았다.'] }),
};

const FALLBACK: InteractionDefinition = define({
  object: 'unknown', label: '무언가', family: 'unknown', radius: 0.72, atten: 1.5, arrivalAngle: 0.05,
  stir: { observe: 0.35, wonder: 0.25 }, seeds: ['look', 'wait', 'photograph'],
  approach: ['별이는 눈에 들어온 무언가를 향해 천천히 걸었다.'],
  observe: ['별이는 그 앞에 잠시 머물렀다.'],
});

export function getInteraction(object: string): InteractionDefinition {
  return INTERACTION_LIBRARY[object] ?? { ...FALLBACK, object };
}

export function interactionApproachText(object: string, random: () => number = Math.random): string {
  const list = getInteraction(object).approach;
  return list[Math.floor(random() * list.length)] ?? FALLBACK.approach[0];
}

export function interactionObservationText(object: string, random: () => number = Math.random): string {
  const list = getInteraction(object).observe;
  return list[Math.floor(random() * list.length)] ?? FALLBACK.observe[0];
}

export function getAttractableStimuli(): Record<string, { radius: number; atten: number; stir: InteractionStimulus }> {
  return Object.fromEntries(Object.entries(INTERACTION_LIBRARY).map(([id, d]) => [id, { radius: d.radius, atten: d.atten, stir: d.stir }]));
}
