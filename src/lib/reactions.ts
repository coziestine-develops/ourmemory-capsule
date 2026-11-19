import { REACTIONS, type MemoryReaction, type ReactionKey } from '../types';

export interface ReactionSummary {
  key: ReactionKey;
  emoji: string;
  label: string;
  count: number;
  mine: boolean;
}

/** Counts each reaction type and flags the ones the current person has added. */
export function summarizeReactions(rows: Pick<MemoryReaction, 'user_id' | 'reaction'>[], userId: string): ReactionSummary[] {
  return REACTIONS.map((reaction) => {
    const matching = rows.filter((row) => row.reaction === reaction.key);
    return {
      key: reaction.key,
      emoji: reaction.emoji,
      label: reaction.label,
      count: matching.length,
      mine: matching.some((row) => row.user_id === userId),
    };
  });
}
