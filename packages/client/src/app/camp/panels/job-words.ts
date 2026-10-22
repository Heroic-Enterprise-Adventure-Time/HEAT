import { JOBS, MONSTERS, RESOURCE_NODES, type Job, type Stage } from '@heat/engine';

/** The jobs a location's job board posts, in the content's order. */
export function jobsAt(location: string): Job[] {
  return Object.values(JOBS).filter((job) => job.location === location);
}

export function jobAt(location: string, id: string | null | undefined): Job | undefined {
  return jobsAt(location).find((job) => job.id === id);
}

/** "a wolf", "2 wolves", "3 trees", "2 ore veins". */
function count(n: number, name: string): string {
  const one = name.toLowerCase();
  if (n === 1) return `a ${one}`;
  return `${n} ${one.endsWith('f') ? `${one.slice(0, -1)}ves` : `${one}s`}`;
}

/** The materials a gather stage yields, from its nodes, in order and once each. */
function gathered(stage: Extract<Stage, { kind: 'gather' }>): string[] {
  return [...new Set(stage.nodes.map((n) => RESOURCE_NODES[n.type].material))];
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
  const entry = (material: string) => byMaterial.get(material) ?? byMaterial.set(material, { pay: 0, cargo: 0 }).get(material)!;
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
  const parts = [job.retreat.keepsPay ? 'keeps the pay' : 'forfeits the pay'];
  const cargo = [...new Set(job.stages.flatMap((s) => (s.kind === 'gather' ? gathered(s) : [])))];
  if (cargo.length > 0) parts.push(`${job.retreat.keepsCargo ? 'keeps' : 'abandons'} the ${cargo.join(' and ')} gathered`);
  const xp = job.retreat.xpPercent;
  parts.push(xp === 100 ? 'earns the full XP' : xp === 50 ? 'earns half the XP' : xp === 0 ? 'earns no XP' : `earns ${xp}% of the XP`);
  const last = parts.pop()!;
  return `A retreat ${parts.length > 1 ? `${parts.join(', ')}, and ${last}` : `${parts[0]} and ${last}`}.`;
}
