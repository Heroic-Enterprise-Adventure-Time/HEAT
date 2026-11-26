import { uniqBy } from 'es-toolkit';

import { type AdventureEvent, expandStages, jobOf, MONSTERS } from '@heat/engine';

import type { FieldUnit } from './field';

/**
 * Who a run may show, which the battle scene loads the art of before the run
 * begins (Issue-205): a hero by its unit type and sprite set, anyone else by
 * its kind and type. A run is begun once the art of its whole cast is in, so
 * a cast too wide costs a longer wait and one too narrow a unit that shows a
 * moment after it arrives.
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
 * Everyone this adventure of a job sets against the party, and its cart on a
 * job that delivers (decision 0059): the job's stages
 * as the engine expands them from the adventure's seed (decision 0058,
 * Issue-341), by the same function the run itself is about to call, so the
 * cast is who the run will meet and nobody else. A job that varies loads its
 * wolf's art on the runs that have a wolf. A job that is not in this build's
 * content has nobody known.
 */
export function jobCast(jobId: string, seed: string): readonly CastMember[] {
  const job = jobOf(jobId);
  if (!job) return [];
  const cart: readonly CastMember[] = job.deliversTo === undefined ? [] : [{ kind: 'cart', type: 'cart' }];
  return once([
    ...cart,
    ...expandStages(job, seed).flatMap((stage) =>
      'opponents' in stage ? stage.opponents.map(({ type }): CastMember => ({ kind: Object.hasOwn(MONSTERS, type) ? 'monster' : 'resource', type })) : [],
    ),
  ]);
}

/** Everyone a stored timeline sets against the party, and the cart where it stood beside it, read from its battles: a replay shows who was there, whatever the job says now. */
export function timelineCast(events: readonly AdventureEvent[]): readonly CastMember[] {
  return once(
    events.flatMap((event) =>
      event.kind === 'battle-start' ? event.participants.filter((p) => p.side === 'opponents' || p.kind === 'cart').map(({ kind, type }): CastMember => ({ kind, type })) : [],
    ),
  );
}
