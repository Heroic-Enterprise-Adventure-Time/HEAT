import type { RecentAdventureView, ReplayView } from '../game';

/** One hero of a replay's party, as a list says it: never whose it was (decision 0050). */
export interface ReplayHero {
  readonly name: string;
  readonly unitType: string;
  /** The hero's level after settlement. */
  readonly level: number;
  readonly died: boolean;
}

/**
 * One settled adventure as a list of replays shows it, the job board's
 * recent adventures or a job's replays (Issue-290): the same line from
 * either read, so both lists say it the same way.
 */
export interface ReplayLine {
  readonly id: string;
  readonly job: string;
  /** The engine's outcome, or one a newer deploy sent as the hub put it (angular.md, rule 6). */
  readonly outcome: string;
  readonly settledAt: string;
  readonly party: readonly ReplayHero[];
}

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** A recent adventure as the job board's list shows it. */
export function recentLine(recent: RecentAdventureView): ReplayLine {
  return { id: recent.id, job: recent.job.name, outcome: recent.outcome, settledAt: recent.settledAt, party: recent.party };
}

/**
 * A job's replay as its list shows it: the party as it set out, each with the
 * level and the death the result gave it. Null for a record that is not
 * settled, which the hub's index never lists (decision 0050).
 */
export function replayLine(replay: ReplayView): ReplayLine | null {
  const { result, settledAt } = replay;
  if (!result || !settledAt) return null;
  const after = new Map(result.heroes.map((h) => [h.heroId, h]));
  const party = replay.snapshot.heroes.map((h) => {
    const settled = after.get(h.heroId);
    return { name: h.name, unitType: h.unitType, level: settled?.level ?? h.level, died: settled?.dead ?? false };
  });
  return { id: replay.id, job: replay.job.name, outcome: result.outcome, settledAt, party };
}

/** The party in words, "Wat (fighter, level 2), Wren (villager, level 1, died)". */
export function partyWords(party: readonly ReplayHero[]): string {
  return party.map((h) => `${h.name} (${h.unitType}, level ${h.level}${h.died ? ', died' : ''})`).join(', ');
}

/** How long ago a time was, in the largest whole unit, "3 hours ago"; under a minute is "just now", and a clock behind the hub's says the same. */
export function agoWords(at: string, now: number): string {
  const ms = now - Date.parse(at);
  const count = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'} ago`;
  if (ms < MINUTE_MS) return 'just now';
  if (ms < HOUR_MS) return count(Math.floor(ms / MINUTE_MS), 'minute');
  if (ms < DAY_MS) return count(Math.floor(ms / HOUR_MS), 'hour');
  return count(Math.floor(ms / DAY_MS), 'day');
}
