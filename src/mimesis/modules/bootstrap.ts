import { registerMemoryProcessor } from '../moduleRegistry';
import { saveBecomingByeoli } from '../../life/becomingByeoli';

let bootstrapped = false;

/** Register built-in MIMESIS modules exactly once. */
export function bootstrapMimesisModules(): void {
  if (bootstrapped) return;
  bootstrapped = true;

  registerMemoryProcessor('becoming-byeoli', (memories) => {
    saveBecomingByeoli(memories as Parameters<typeof saveBecomingByeoli>[0]);
  });
}
