// BUILD 405-E: 2D·3D가 함께 쓰는 별이력.
// 현실 60초가 별이의 하루다. 세계 표현(2D/3D)과 무관한 절대시간 층.

export const BYEOLI_DAY_SECONDS = 60;

// 이 순간을 별이력 9075년 4월 11일 00:00으로 둔다.
// 2026-07-13 15:45 KST = 2026-07-13 06:45 UTC.
export const BYEOLI_CALENDAR_EPOCH_MS = Date.UTC(2026, 6, 13, 6, 45, 0);

export type ByeoliDate = {
  year: number;
  month: number;
  day: number;
  epoch: number;
};

export function byeoliDayEpoch(nowMs: number = Date.now()): number {
  return Math.floor((nowMs - BYEOLI_CALENDAR_EPOCH_MS) / (BYEOLI_DAY_SECONDS * 1000));
}

// 별이력은 우선 12개월 × 30일의 단순 달력으로 시작한다.
// 달력 규칙이 확장돼도 HabitEngine은 정수 epoch만 보므로 영향받지 않는다.
export function byeoliDate(nowMs: number = Date.now()): ByeoliDate {
  const epoch = byeoliDayEpoch(nowMs);
  const baseDayIndex = ((9075 * 12 + (4 - 1)) * 30) + (11 - 1);
  const absolute = baseDayIndex + epoch;
  const year = Math.floor(absolute / 360);
  const inYear = ((absolute % 360) + 360) % 360;
  const month = Math.floor(inYear / 30) + 1;
  const day = (inYear % 30) + 1;
  return { year, month, day, epoch };
}

export function formatByeoliDate(nowMs: number = Date.now()): string {
  const d = byeoliDate(nowMs);
  return `별이력 ${d.year}년 ${d.month}월 ${d.day}일`;
}
