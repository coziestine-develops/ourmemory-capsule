import type { Memory, MemoryMedia } from '../../types';

export function coverOf(memory: Memory): MemoryMedia | undefined {
  const media = [...(memory.memory_media ?? [])].sort((a, b) => a.display_order - b.display_order);
  return media.find((m) => m.is_cover) ?? media[0];
}
