import { LowerCasePipe } from '@angular/common';
import { Component, computed, inject, resource, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import { FACILITIES, type FacilityKind, MAX_PARTY } from '@heat/engine';

import { replayLine } from '../../adventure/replay-words';
import { Game, type StartRefusal } from '../../game';
import { Refusal, refusalWords } from '../../hub';
import { CampState } from '../camp-state';
import { bonusWords, jobAt, NO_PAY, retreatWords, rewardWords } from './job-words';
import { ReplayList } from './replay-list';

/**
 * The hub's refusals of a start, by type, in the player's words; any other is
 * shown as the hub put it. A job the location does not post, a party of the
 * wrong size or a hero that is not the player's are the client's own
 * defects, refused as BAD_USER_INPUT, and this panel never sends them.
 * A caravan's two, a cargo the camp cannot pay and a destination hall with
 * no room for who stays, cannot come back while the panel sends no cargo and
 * nobody to stay; the caravan's page is Issue-355.
 */
const REFUSALS: Readonly<Record<Exclude<StartRefusal, 'Requires'>, string>> = {
  AdventureOpen: 'An adventure is already under way. Only one can be open at a time.',
  InsufficientResources: 'The camp cannot pay for the cargo now.',
  HallFull: 'The heroes hall at the destination has no room for everyone who stays.',
  HeroNotHere: 'A hero in the party is not at this camp.',
  HeroDead: 'A hero in the party is dead.',
  HeroRetired: 'A hero in the party has retired.',
  HeroAdventuring: 'A hero in the party is already on an adventure.',
  Conflict: 'The party changed while setting out, and nobody left. Try again.',
};

/**
 * A job's detail under the poster that lists it, the job board,
 * `/camp/<location>/job-board/jobs/<id>`, or a facility the camp has built,
 * such as `/camp/<location>/mine/jobs/<id>`, so the menu keeps the poster
 * marked (Issue-115, refined by Issue-109; Issue-133): its description, which is all the page tells of what the job
 * holds; its pay, each resource beside the camp's balance and the room left
 * under the warehouse's cap ("Resources"), and its bonus XP; what a retreat
 * keeps, in words; and never its stages nor what its enemies drop, so the
 * room is shown for the pay alone (decision 0058; the owner, 2026-11-20,
 * Issue-339, on the stages); then the party pick, one to four of the camp's
 * living heroes in no order, since a unit type's home line places it; and
 * Depart, which starts it and goes to `/adventure`. A refusal is shown in
 * place, under Depart. Last, the job's replays, anyone's and every outcome,
 * each opening its replay page, read when the page opens (Issue-290,
 * decision 0053).
 */
@Component({
  selector: 'heat-job-panel',
  imports: [LowerCasePipe, RouterLink, ReplayList],
  templateUrl: './job-panel.html',
  styleUrl: './panel.css',
})
export class JobPanel {
  protected readonly game = inject(Game);
  private readonly camp = inject(CampState);
  private readonly router = inject(Router);
  private readonly params = toSignal(inject(ActivatedRoute).paramMap);
  protected readonly maxParty = MAX_PARTY;

  /** The poster: the job board, whose route names no facility, or the facility in the address; null for no such facility. */
  private readonly poster = computed((): FacilityKind | null => {
    const facility = this.params()?.get('facility');
    if (!facility) return 'job-board';
    return Object.hasOwn(FACILITIES, facility) ? (facility as FacilityKind) : null;
  });
  protected readonly posterName = computed(() => {
    const poster = this.poster();
    return poster ? FACILITIES[poster].name : 'Camp';
  });
  /** A facility posts its jobs only once built (game.md, "Locations and camps"). */
  protected readonly job = computed(() => {
    const poster = this.poster();
    if (!poster || (poster !== 'job-board' && (this.camp.facility(poster)?.level ?? 0) < 1)) return undefined;
    return jobAt(this.game.location(), poster, this.params()?.get('job'));
  });
  /** What a job with no pay says in its place, from the same words as the board's list. */
  protected readonly noPay = NO_PAY;
  /** The job's pay, each resource of it beside what the camp holds and the room the warehouse has left for it. */
  protected readonly pay = computed(() => {
    const camp = this.game.camp();
    return (this.job()?.pay ?? []).map((reward) => {
      const balance = camp?.holdings.find((h) => h.material === reward.material)?.balance ?? 0;
      return { material: reward.material, words: rewardWords(reward), balance, room: Math.max(0, (camp?.resourceCapacity ?? 0) - balance) };
    });
  });
  protected readonly bonus = computed(() => {
    const job = this.job();
    return job ? bonusWords(job) : '';
  });
  private readonly replays = resource({ params: () => this.job()?.id, loader: ({ params }) => this.game.replaysOf(params) });
  protected readonly replayLines = computed(() =>
    // A list read again for another job says Loading, not the last job's lines.
    this.replays.hasValue() && !this.replays.isLoading() ? this.replays.value().flatMap((replay) => replayLine(replay) ?? []) : undefined,
  );
  protected readonly replaysFailed = computed(() => this.replays.status() === 'error');
  protected readonly retreat = computed(() => {
    const job = this.job();
    return job ? retreatWords(job) : '';
  });

  private readonly chosen = signal<ReadonlySet<string>>(new Set());
  /** The heroes picked who are still alive here: a refusal reloads the camp, and one may have gone. */
  protected readonly picked = computed(() => {
    const living = new Set(this.game.livingHere().map((h) => h.id));
    return new Set([...this.chosen()].filter((id) => living.has(id)));
  });
  /** Whether the party is setting out, while the hub answers. */
  protected readonly pending = signal(false);
  protected readonly refusal = signal<string | null>(null);

  protected toggle(id: string): void {
    const next = new Set(this.picked());
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_PARTY) next.add(id);
    this.chosen.set(next);
  }

  protected async depart(jobId: string): Promise<void> {
    this.refusal.set(null);
    this.pending.set(true);
    try {
      await this.game.startAdventure(this.game.location(), jobId, [...this.picked()]);
      await this.router.navigate(['/adventure']);
    } catch (e) {
      const facility = this.job()?.facility;
      // The facility that posts the job is not built: the hub's rule, as Issue-133 gave it, with the facility's name.
      const requires = e instanceof Refusal && e.kind === 'Requires' ? facility : undefined;
      this.refusal.set(requires ? `Build the ${FACILITIES[requires].name.toLowerCase()} first.` : refusalWords(e, REFUSALS));
    } finally {
      this.pending.set(false);
    }
  }
}
