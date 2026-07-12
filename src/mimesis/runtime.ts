import { bootstrapMimesisModules } from './modules/bootstrap';

bootstrapMimesisModules();

export { runMemoryProcessors, registeredMemoryModules } from './moduleRegistry';
export { createHandMount, findHandBone, type HandSide } from './modules/handMount';
export {
  ROAMING_ANIMALS,
  animalTemperament,
  chooseAnimalGoal,
  makeAnimalState,
  mapAnimalClips,
  playAnimalMode,
  type AnimalLifeState,
  type AnimalMode,
} from './modules/animalMotion';
