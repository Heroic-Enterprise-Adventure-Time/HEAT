import { uniq } from 'es-toolkit';

import { type FacilityKind, type Job, jobsPostedBy, MONSTERS, RESOURCE_NODES, type Stage } from '@heat/engine';

/** The jobs a poster at a location lists, the job board or a facility, in the content's order (Issue-133). */
export function jobsAt(location: string, poster: FacilityKind): Job[] {
  return jobsPostedBy(location, poster);
}

export function jobAt(location: string, poster: FacilityKind, id: string | null | undefined): Job | undefined {
  return jobsAt(location, poster).find((job) => job.id === id);
}

/** "a wolf", "2 wolves", "3 trees", "2 ore veins". */
function count(n: number, name: string): string {
  const one = name.toLowerCase();
  if (n === 1) return `a ${one}`;
  return `${n} ${one.endsWith('f') ? `${one.slice(0, -1)}ves` : `${one}s`}`;
}

/** The materials a gather stage yields, from its nodes, in order and once each. */
function gathered(stage: Extract<Stage, { kind: 'gather' }>): string[] {
  return uniq(stage.nodes.map((n) => RESOURCE_NODES[n.type].material));
}

/**
 * One stage in the player's words. A stage's time limit is not said: it is a
 * deadlock kill switch, counted down only in its last ten seconds (decision 0030).
 */
export function stageWords(stage: Stage): string {
  switch (stage.kind) {
    case 'travel':
      return 'Travel';
    case 'fight':
      return `Fight ${stage.monsters.map((m) => count(m.count, MONSTERS[m.type].name)).join(' and ')}`;
    case 'gather':
      return `Gather ${gathered(stage).join(' and ')} from ${stage.nodes.map((n) => count(n.count, RESOURCE_NODES[n.type].name)).join(' and ')}, up to ${stage.carry}`;
    case 'arrive':
      return 'Arrive';
  }
}

/** What a job credits to the camp on arrival: its pay, and what it can carry home, each by material. */
export interface Credit {
  readonly material: string;
  readonly pay: number;
  /** The most a gather stage can bring home, or 0 if the job gathers none of it. */
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
    if (stage.kind !== 'gather') continue;
    // A party carries `carry` in all; with one material, that is the most of it.
    for (const material of gathered(stage)) entry(material).cargo += stage.carry;
  }
  return [...byMaterial].map(([material, c]) => ({ material, ...c }));
}

/** "10 cloth", "up to 60 timber", "3 cloth and up to 60 timber". */
export function creditWords(credit: Credit): string {
  const parts: string[] = [];
  if (credit.pay > 0) parts.push(`${credit.pay}`);
  if (credit.cargo > 0) parts.push(`up to ${credit.cargo}`);
  return `${parts.join(' and ')} ${credit.material}`;
}

/**
 * What a job brings home, its pay and its cargo, for the board's list:
 * "10 cloth", "up to 40 timber", "3 cloth and up to 60 timber". A job with
 * no pay still brings home what it gathers (decision 0031).
 */
export function yieldWords(job: Job): string {
  const words = credits(job).map(creditWords);
  return words.length === 0 ? 'nothing to bring home' : words.join(' and ');
}

/** A job's retreat penalty in words: "A retreat forfeits the pay, keeps the timber gathered, and earns half the XP." */
export function retreatWords(job: Job): string {
  const pay = job.retreat.keepsPay ? 'keeps the pay' : 'forfeits the pay';
  const cargo = uniq(job.stages.flatMap((s) => (s.kind === 'gather' ? gathered(s) : [])));
  const carried = cargo.length > 0 ? `${job.retreat.keepsCargo ? 'keeps' : 'abandons'} the ${cargo.join(' and ')} gathered` : null;
  const xp = job.retreat.xpPercent;
  const earns = xp === 100 ? 'earns the full XP' : xp === 50 ? 'earns half the XP' : xp === 0 ? 'earns no XP' : `earns ${xp}% of the XP`;
  return `A retreat ${carried ? `${pay}, ${carried}, and ${earns}` : `${pay} and ${earns}`}.`;
}
