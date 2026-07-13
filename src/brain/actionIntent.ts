export const BYEOLI_DRIVES = ['observe', 'rest', 'record', 'wonder'] as const;

export type ByeoliDrive = (typeof BYEOLI_DRIVES)[number];

export type ByeoliAction = ByeoliDrive | 'walk' | 'pass';
export type ByeoliWorldType = 'planet-3d' | 'town-2d';

export type ByeoliActionReason = {
  currentDrive: number;
  objectStimulus: number;
  habitBias: number;
  personalityBias: number;
  fatiguePenalty: number;
  randomness: number;
};

/**
 * Renderer-independent decision made by Byeoli's shared brain.
 * 2D and 3D worlds translate the same intent into their own motion language.
 */
export type ByeoliActionIntent = {
  id: string;
  action: ByeoliAction;
  targetId?: string;
  targetType?: string;
  duration: number;
  drive: ByeoliDrive;
  score: number;
  reason: ByeoliActionReason;
  context: {
    worldType: ByeoliWorldType;
    timestamp: number;
    seed?: number;
  };
};
