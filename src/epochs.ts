import type { Turn } from './model.ts';

/** A drop smaller than this is noise in the recorded numbers, not a compaction. */
const MIN_DROP_SHARE = 0.05;
const MIN_DROP_TOKENS = 500;

function isCompaction(previous: number | null, current: number | null): boolean {
  if (previous === null || current === null) return false;
  // A zero prompt is a missing measurement, not a context that was emptied.
  if (current <= 0) return false;
  if (current >= previous) return false;
  if (previous - current < MIN_DROP_TOKENS) return false;
  return (previous - current) / previous >= MIN_DROP_SHARE;
}

/**
 * A context epoch runs from one compaction to the next. Content injected in an epoch stops paying
 * rent when that epoch ends, because the record shows the context shrinking — the content is gone.
 * The array is positional: `ends[i]` is the index of the last turn of the epoch containing `turns[i]`.
 */
export function epochEnds(turns: Turn[]): number[] {
  const ends = new Array<number>(turns.length);
  if (turns.length === 0) return ends;

  const last = turns[turns.length - 1] as Turn;
  let start = 0;

  for (let index = 1; index < turns.length; index += 1) {
    const previous = turns[index - 1]?.contextTokens ?? null;
    const current = turns[index]?.contextTokens ?? null;
    if (!isCompaction(previous, current)) continue;

    const boundary = (turns[index - 1] as Turn).index;
    for (let fill = start; fill < index; fill += 1) ends[fill] = boundary;
    start = index;
  }

  for (let fill = start; fill < turns.length; fill += 1) ends[fill] = last.index;
  return ends;
}

/** Index into `turns` where the last context epoch starts. */
export function lastEpochStart(turns: Turn[]): number {
  let start = 0;
  for (let index = 1; index < turns.length; index += 1) {
    const previous = turns[index - 1]?.contextTokens ?? null;
    const current = turns[index]?.contextTokens ?? null;
    if (isCompaction(previous, current)) start = index;
  }
  return start;
}
