import type { CarrierRent, SkillRent, Turn } from './model.ts';
import { epochEnds } from './epochs.ts';

export type RentBreakdown = {
  rent: number | null;
  carriers: CarrierRent[];
  skills: SkillRent[] | null;
};

/**
 * Rent is charged per injection for every turn it survives. An injection introduced at turn t
 * pays `size x turns survived`, and the epoch rule stops the charge at the next compaction.
 */
export function computeRent(turns: Turn[]): RentBreakdown {
  const ends = epochEnds(turns);
  const carriers = new Map<string, CarrierRent>();
  const skills = new Map<string, SkillRent>();

  let rent = 0;
  let measured = 0;
  let attributionSeen = false;

  for (const [position, turn] of turns.entries()) {
    if (turn.attribution?.skill || turn.attribution?.mcpTool) attributionSeen = true;

    const epochEnd = ends[position] ?? turn.index;
    const lifespan = epochEnd - turn.index + 1;

    for (const injection of turn.injections) {
      if (injection.size === null) continue;
      measured += 1;

      const piece = injection.size * lifespan;
      rent += piece;

      const key = `${injection.kind}:${injection.carrier}`;
      const existing = carriers.get(key);
      if (existing) {
        existing.rent += piece;
        existing.size += injection.size;
        existing.injections += 1;
        existing.lastTurn = turn.index;
      } else {
        carriers.set(key, {
          carrier: injection.carrier,
          kind: injection.kind,
          size: injection.size,
          rent: piece,
          firstTurn: turn.index,
          lastTurn: turn.index,
          injections: 1,
        });
      }

      const skill = turn.attribution?.skill ?? null;
      const mcpTool = turn.attribution?.mcpTool ?? null;
      if (skill === null && mcpTool === null) continue;

      const name = skill ?? (mcpTool as string);
      const kind = skill === null ? 'mcp-tool' : 'skill';
      const skillKey = `${kind}:${name}`;
      const entry = skills.get(skillKey);
      if (entry) entry.rent += piece;
      else skills.set(skillKey, { name, kind, rent: piece });
    }
  }

  const sortedCarriers = [...carriers.values()].sort((a, b) => b.rent - a.rent);

  return {
    rent: measured === 0 ? null : rent,
    carriers: sortedCarriers,
    skills: attributionSeen ? [...skills.values()].sort((a, b) => b.rent - a.rent) : null,
  };
}
