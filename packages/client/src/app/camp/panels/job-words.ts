import { uniq } from 'es-toolkit';

import { type FacilityKind, isResourceType, type Job, jobsPostedBy, MONSTERS, type MonsterType, RESOURCE_NODES, type ResourceType, type Stage } from '@heat/engine';

/** The jobs a poster at a location lists, the job board or a facility, in the content's order (Issue-133). */
export function jobsAt(location: string, poster: FacilityKind): Job[] {
  return jobsPostedBy(location, poster);
}

export function jobAt(location: string, poster: FacilityKind, id: string | null | undefined): Job | undefined {
  return jobsAt(location, poster).find((job) => job.id === id);
}

/** "a wolf", "an ore vein", "2 wolves", "3 trees", "2 ore veins". */
function count(n: number, name: string): string {
  const one = name.toLowerCase();
  if (n === 1) return `${/^[aeiou]/.test(one) ? 'an' : 'a'} ${one}`;
  return `${n} ${one.endsWith('f') ? `${one.slice(0, -1)}ves` : `${one}s`}`;
}

/**
 * What stands on the other side of a stage, its resource nodes apart from its
 * monsters, each by type and count; none for a stage with no other side. Two
 * passes and not one `partition`, which cannot tell the compiler that what is
 * left of one object type is the monsters.
 */
function otherSide(stage: Stage): { nodes: { type: ResourceType; count: number }[]; monsters: { type: MonsterType; count: number }[] } {
  const opponents = stage.kind === 'fight' || stage.kind === 'gather' ? stage.opponents : [];
  return {
    nodes: opponents.flatMap(({ type, count: n }) => (isResourceType(type) ? [{ type, count: n }] : [])),
    monsters: opponents.flatMap(({ type, count: n }) => (isResourceType(type) ? [] : [{ type, count: n }])),
  };
}

/** The materials a stage yields, from its nodes, in order and once each. */
function gathered(stage: Stage): string[] {
  return uniq(otherSide(stage).nodes.map((n) => RESOURCE_NODES[n.type].material));
}

/**
 * One stage in the player's words, from what stands on its other side: the
 * nodes are gathered from and the monsters fought, together where a stage has
 * both (decision 0051). A stage's time limit is not said: it is a deadlock
 * kill switch, counted down only in its last ten seconds (decision 0030).
 */
export function stageWords(stage: Stage): string {
  switch (stage.kind) {
    case 'travel':
      return 'Travel';
    case 'fight':
    case 'gather': {
      const { nodes, monsters: fought } = otherSide(stage);
      const sources = nodes.map((n) => count(n.count, RESOURCE_NODES[n.type].name));
      const monsters = fought.map((m) => count(m.count, MONSTERS[m.type].name));
      const gather = sources.length > 0 ? `Gather ${gathered(stage).join(' and ')} from ${sources.join(' and ')}` : null;
      if (monsters.length === 0) return gather ?? 'Fight';
      return gather ? `${gather}, and fight ${monsters.join(' and ')}` : `Fight ${monsters.join(' and ')}`;
    }
    case 'arrive':
      return 'Arrive';
  }
}

/** What a job credits to the camp on arrival: its pay, and the most it can gather, each by material. */
export interface Credit {
  readonly material: string;
  readonly pay: number;
  /**
   * The most the job's nodes give, their maximums together, or 0 if the job
   * gathers none of it. What a party brings home of it is by its gather
   * ratings (decision 0051).
   */
  readonly cargo: number;
}

export function credits(job: Job): Credit[] {
  const byMaterial = new Map<string, { pay: number; cargo: number }>();
  const entry = (material: string) => {
    const found = byMaterial.get(material);
    if (found) return found;
    const fresh = { pay: 0, cargo: 0 };
    byMaterial.set(material, fresh);
    return fresh;
  };
  for (const reward of job.pay) entry(reward.material).pay += reward.amount;
  for (const stage of job.stages) {
    for (const node of otherSide(stage).nodes) entry(RESOURCE_NODES[node.type].material).cargo += node.count * RESOURCE_NODES[node.type].maxYield;
  }
  return [...byMaterial].map(([material, c]) => ({ material, ...c }));
}

/** "10 cloth", "up to 90 timber", "5 and up to 90 timber". */
export function creditWords(credit: Credit): string {
  const parts: string[] = [];
  if (credit.pay > 0) parts.push(`${credit.pay}`);
  if (credit.cargo > 0) parts.push(`up to ${credit.cargo}`);
  return `${parts.join(' and ')} ${credit.material}`;
}

/**
 * What a job brings home, its pay and its cargo, for the board's list:
 * "10 cloth", "up to 45 timber", "3 cloth and up to 90 timber". A job with
 * no pay still brings home what it gathers (decision 0031).
 */
export function yieldWords(job: Job): string {
  const words = credits(job).map(creditWords);
  return words.length === 0 ? 'nothing to bring home' : words.join(' and ');
}

/** A job's retreat penalty in words: "A retreat forfeits the pay, keeps the timber gathered, and earns half the XP." */
export function retreatWords(job: Job): string {
  const pay = job.retreat.keepsPay ? 'keeps the pay' : 'forfeits the pay';
  const cargo = uniq(job.stages.flatMap(gathered));
  const carried = cargo.length > 0 ? `${job.retreat.keepsCargo ? 'keeps' : 'abandons'} the ${cargo.join(' and ')} gathered` : null;
  const xp = job.retreat.xpPercent;
  const earns = xp === 100 ? 'earns the full XP' : xp === 50 ? 'earns half the XP' : xp === 0 ? 'earns no XP' : `earns ${xp}% of the XP`;
  return `A retreat ${carried ? `${pay}, ${carried}, and ${earns}` : `${pay} and ${earns}`}.`;
}
