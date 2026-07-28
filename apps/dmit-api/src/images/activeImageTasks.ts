/** In-process image worker active set (P961 reconcile skips these). */

const activeTasks = new Set<string>();

export function markImageGenerationActive(requestId: string): boolean {
  if (activeTasks.has(requestId)) return false;
  activeTasks.add(requestId);
  return true;
}

export function clearImageGenerationActive(requestId: string): void {
  activeTasks.delete(requestId);
}

export function isImageGenerationActive(requestId: string): boolean {
  return activeTasks.has(requestId);
}
