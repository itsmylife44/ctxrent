import type { Injection, Turn, WasteClaim } from './model.ts';
import { epochEnds } from './epochs.ts';

const WRITE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const DEAD_PAYLOAD_MIN_SIZE = 500;
const DEAD_PAYLOAD_MIN_AGE = 2;
const DUPLICATE_MIN_SIZE = 200;
const RETRY_WINDOW = 2;
const RETRYABLE: Set<Injection['kind']> = new Set(['tool-result', 'file-read']);

type Placed = {
  injection: Injection;
  turn: number;
  epochEnd: number;
};

/**
 * Waste is the share of an injection's rent charged after the turn in which the content stopped
 * being useful. Each rule states why it stopped, and every claim names the carrier and the turns
 * that justify it. A rule that cannot see enough to be sure stays silent.
 */
export function classifyWaste(turns: Turn[]): WasteClaim[] {
  const claims: WasteClaim[] = [];
  const claimed = new Set<Injection>();
  const ends = epochEnds(turns);
  const entries = placed(turns, ends);

  const writeTurns = firstWriteTurns(turns);

  for (const { injection, turn, epochEnd } of entries) {
    if (injection.kind !== 'file-read' || injection.path === null) continue;
    const writeTurn = writeTurns.get(injection.path);
    if (writeTurn === undefined || writeTurn < turn) continue;

    const wasted = wastedAfter(injection, epochEnd, writeTurn);
    if (wasted <= 0) continue;

    claims.push({
      kind: 'superseded-read',
      carrier: injection.carrier,
      rent: wasted,
      turns: [turn, writeTurn],
      reason: `read at turn ${turn}, rewritten at turn ${writeTurn}`,
    });
    claimed.add(injection);
  }

  // Content injected verbatim a second time in the same epoch is pure duplication: it is already
  // in the context, so the copy charges rent for nothing.
  const seenInEpoch = new Set<string>();
  for (const { injection, turn, epochEnd } of entries) {
    if (injection.kind !== 'attachment') continue;
    if (injection.contentHash === null || injection.size === null) continue;
    if (injection.size < DUPLICATE_MIN_SIZE) continue;

    const key = `${epochEnd}:${injection.contentHash}`;
    if (!seenInEpoch.has(key)) {
      seenInEpoch.add(key);
      continue;
    }

    const wasted = wastedAfter(injection, epochEnd, turn);
    if (wasted <= 0) continue;

    claims.push({
      kind: 'duplicate-context',
      carrier: injection.carrier,
      rent: wasted,
      turns: [turn],
      reason: 'identical attachment already present in the context',
    });
    claimed.add(injection);
  }

  for (const { injection, turn, epochEnd } of entries) {
    if (claimed.has(injection) || injection.size === null) continue;
    if (!RETRYABLE.has(injection.kind)) continue;
    if (!isSpecific(injection.carrier)) continue;
    if (!isRetry(entries, injection, turn)) continue;

    const wasted = wastedAfter(injection, epochEnd, turn);
    if (wasted <= 0) continue;

    claims.push({
      kind: 'retry-loop',
      carrier: injection.carrier,
      rent: wasted,
      turns: [turn],
      reason: `same carrier injected again within ${RETRY_WINDOW} turns`,
    });
    claimed.add(injection);
  }

  const occurrences = new Map<string, number>();
  for (const { injection } of entries) {
    const key = keyOf(injection);
    occurrences.set(key, (occurrences.get(key) ?? 0) + 1);
  }

  for (const { injection, turn, epochEnd } of entries) {
    if (claimed.has(injection) || injection.size === null) continue;
    if (injection.kind !== 'tool-result') continue;
    if (injection.size < DEAD_PAYLOAD_MIN_SIZE) continue;
    if ((occurrences.get(keyOf(injection)) ?? 0) > 1) continue;
    if (epochEnd - turn < DEAD_PAYLOAD_MIN_AGE) continue;

    const wasted = wastedAfter(injection, epochEnd, turn);
    if (wasted <= 0) continue;

    claims.push({
      kind: 'dead-payload',
      carrier: injection.carrier,
      rent: wasted,
      turns: [turn],
      reason: `carrier never used again, ${epochEnd - turn} turns of rent left to pay`,
    });
    claimed.add(injection);
  }

  return claims.sort((a, b) => b.rent - a.rent);
}

/** A carrier with no detail is just a tool name, so two calls cannot be told apart. */
function isSpecific(carrier: string): boolean {
  return carrier.includes(' ');
}

function firstWriteTurns(turns: Turn[]): Map<string, number> {
  const writes = new Map<string, number>();
  for (const turn of turns) {
    for (const call of turn.toolCalls) {
      if (!WRITE_TOOLS.has(call.name)) continue;
      const path = call.input?.['file_path'];
      if (typeof path !== 'string') continue;
      if (!writes.has(path)) writes.set(path, turn.index);
    }
  }
  return writes;
}

function placed(turns: Turn[], ends: number[]): Placed[] {
  const entries: Placed[] = [];
  for (const [position, turn] of turns.entries()) {
    const epochEnd = ends[position] ?? turn.index;
    for (const injection of turn.injections) {
      entries.push({ injection, turn: turn.index, epochEnd });
    }
  }
  return entries;
}

function keyOf(injection: Injection): string {
  return `${injection.kind}:${injection.carrier}`;
}

function isRetry(entries: Placed[], injection: Injection, turn: number): boolean {
  const key = keyOf(injection);
  for (const other of entries) {
    if (other.injection === injection) continue;
    if (other.turn >= turn) break;
    if (turn - other.turn > RETRY_WINDOW) continue;
    if (keyOf(other.injection) === key) return true;
  }
  return false;
}

/** Rent charged from `from` onward: the injection's size times the turns left after that point. */
function wastedAfter(injection: Injection, epochEnd: number, from: number): number {
  if (injection.size === null) return 0;
  return injection.size * Math.max(0, epochEnd - from);
}
