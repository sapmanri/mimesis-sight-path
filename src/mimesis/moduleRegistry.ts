export type MemoryProcessor = (memories: readonly unknown[], newest: unknown) => void;

const memoryProcessors = new Map<string, MemoryProcessor>();

/** Register or replace one derived-memory module by stable id. */
export function registerMemoryProcessor(id: string, processor: MemoryProcessor): void {
  memoryProcessors.set(id, processor);
}

/** Derived modules may fail independently; immutable Memory creation must continue. */
export function runMemoryProcessors(memories: readonly unknown[], newest: unknown): void {
  for (const [id, processor] of memoryProcessors) {
    try {
      processor(memories, newest);
    } catch (error) {
      console.warn(`[MIMESIS module:${id}] memory processor failed`, error);
    }
  }
}

export function registeredMemoryModules(): string[] {
  return [...memoryProcessors.keys()];
}
