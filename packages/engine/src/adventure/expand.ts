/**
 * A job's stages for one adventure, expanded from its seed (decision 0058,
 * "A job's adventures vary"; Issue-341).
 *
 * New in HEAT. The content gives an entry of a fight or a gather stage a count
 * or a range for it, and perhaps a chance of appearing at all; `expandStages`
 * makes each roll and answers stages whose entries are a type and a count,
 * which is what the adventure engine runs. The stages stay the same in number
 * and kind. The generator is the expansion's own, seeded by the adventure's
 * seed: it shares nothing with a battle's, the retreat's or an enemy's drops',
 * so no draw of a fight moves it and nothing a player does reaches it. Every
 * entry takes two draws, its chance and its count, whether or not it varies,
 * so an entry that gains a chance does not move the roll of the one after it.
 *
 * Nothing of the expansion is stored: the snapshot names the job by its id,
 * and the engine, the hub's replay and the client's cast each call this with
 * the same job and seed (`docs/architecture/adventure-loop.md`).
 */

import { SeededRng } from "../battle/index.js";
import type { CountRange, ExpandedStage, Job, Stage, StageEntry } from "./job.js";

/** An entry's count as a least and a most; a fixed count is both. */
export function countRange(count: StageEntry["count"]): CountRange {
  return typeof count === "number" ? { min: count, max: count } : count;
}

/** Whether an entry appears in every adventure of its job: it states no chance. */
export function alwaysAppears(entry: StageEntry): boolean {
  return entry.chancePercent === undefined;
}

function expanded(stages: readonly Stage[], roll: (entry: StageEntry) => number): ExpandedStage[] {
  return stages.map((stage) => {
    // A travel and an arrival list nobody and are run as written.
    if (!("opponents" in stage)) return stage;
    const opponents = stage.opponents.flatMap((entry) => {
      const count = roll(entry);
      return count > 0 ? [{ type: entry.type, count }] : [];
    });
    return { ...stage, opponents };
  });
}

/**
 * The stages of one adventure of the job: each entry rolled from the seed,
 * and left out where its chance did not come up. A fight or a gather that
 * rolls nothing at all is a defect of the content, which gives every such
 * stage an entry that always appears, and fails here with the job's name.
 */
export function expandStages(job: Job, seed: string): readonly ExpandedStage[] {
  const rng = new SeededRng(`${seed}#stages`);
  const stages = expanded(job.stages, (entry) => {
    const chance = rng.nextInt(1, 100);
    const share = rng.next();
    if (chance > (entry.chancePercent ?? 100)) return 0;
    const { min, max } = countRange(entry.count);
    return min + Math.floor(share * (max - min + 1));
  });
  stages.forEach((stage, index) => {
    if ((stage.kind === "fight" || stage.kind === "gather") && stage.opponents.length === 0) {
      throw new Error(`Stage ${String(index)} of job ${job.id} rolled nothing to meet: it needs an entry that always appears`);
    }
  });
  return stages;
}

/** The job's largest roll: every entry appears, at its most. What a time limit and a warehouse have to fit. */
export function largestStages(job: Job): readonly ExpandedStage[] {
  return expanded(job.stages, (entry) => countRange(entry.count).max);
}

/** The job's least roll: only the entries that always appear, each at its least. What every adventure of the job meets. */
export function leastStages(job: Job): readonly ExpandedStage[] {
  return expanded(job.stages, (entry) => (alwaysAppears(entry) ? countRange(entry.count).min : 0));
}
