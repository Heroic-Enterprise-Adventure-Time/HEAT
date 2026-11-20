import { uniqBy } from 'es-toolkit';

import { type AdventureEvent, type JobId, JOBS, MONSTERS } from '@heat/engine';

import type { FieldUnit } from './field';

/**
 * Who a run may show, which the battle scene loads the art of before the run
 * begins (Issue-205): a hero by its unit type and sprite set, anyone else by
 * its kind and type. It is whoever may appear, not whoever will: a run is
 * begun once the art of its whole cast is in, so a cast too wide costs a
 * longer wait and one too narrow a unit that shows a moment after it arrives.
 */
export interface CastMember {
  readonly kind: FieldUnit['kind'];
  /** The unit type, monster type or resource type. */
  readonly type: string;
  /** A hero's sprite set, where it has one; anyone else's is its type's. */
  readonly spriteSet?: string | undefined;
}

const once = (cast: readonly CastMember[]) => uniqBy(cast, (member) => `${member.kind}/${member.type}`);

/**
 * Everyone a job may set against the party: today exactly what its stages
 * name, which the engine reads from the same content. A job that is not in
 * this build's content has nobody known.
 */
export function jobCast(jobId: string): readonly CastMember[] {
  if (!Object.hasOwn(JOBS, jobId)) return [];
  return once(
    JOBS[jobId as JobId].stages.flatMap((stage) =>
      'opponents' in stage ? stage.opponents.map(({ type }): CastMember => ({ kind: Object.hasOwn(MONSTERS, type) ? 'monster' : 'resource', type })) : [],
    ),
  );
}

/** Everyone a stored timeline sets against the party, read from its battles: a replay shows who was there, whatever the job says now. */
export function timelineCast(events: readonly AdventureEvent[]): readonly CastMember[] {
  return once(
    events.flatMap((event) =>
      event.kind === 'battle-start' ? event.participants.filter((p) => p.side === 'opponents').map(({ kind, type }): CastMember => ({ kind, type })) : [],
    ),
  );
}
