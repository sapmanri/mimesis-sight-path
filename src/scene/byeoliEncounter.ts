import type * as THREE from 'three';
import type { DriveState } from './byeoliDrive';

// BUILD 391: 소품과의 한 번의 만남(encounter) 상태를 PlanetWorld 밖으로 분리.
// 이 모듈은 모션을 재생하지 않고, 만남의 생성·종료 판정·전환 상태만 책임진다.

export type ByeoliEncounter = {
  d: THREE.Vector3;
  id: string;
  radius: number;
  step: number;
  arrived: boolean;
  acts: number;
  standing: boolean;
  rising: boolean;
  wasSustained: boolean;
  restedOnce: boolean;
};

export function createEncounter(d: THREE.Vector3, id: string, radius: number): ByeoliEncounter {
  return {
    d,
    id,
    radius,
    step: 0,
    arrived: false,
    acts: 0,
    standing: false,
    rising: false,
    wasSustained: false,
    restedOnce: false,
  };
}

export function shouldEndEncounter(encounter: ByeoliEncounter, drives: DriveState): boolean {
  const peak = Math.max(drives.observe, drives.record, drives.rest, drives.wonder);
  return encounter.acts >= 6 || (encounter.acts >= 2 && peak < 0.35);
}

export function beginStanding(encounter: ByeoliEncounter, seconds = 1.2): void {
  encounter.standing = true;
  encounter.step = seconds;
}

export function beginRising(encounter: ByeoliEncounter, seconds = 1.1): void {
  encounter.wasSustained = false;
  encounter.rising = true;
  encounter.step = seconds;
}
