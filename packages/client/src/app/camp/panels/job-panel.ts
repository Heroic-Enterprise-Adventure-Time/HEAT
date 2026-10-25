import { Component, computed, inject, signal } from '@angular/core';
import { LowerCasePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FACILITIES, MAX_PARTY, type FacilityKind, type Stage } from '@heat/engine';
import { ApiError } from '../../api';
import { Game } from '../../game';
import { CampState } from '../camp-state';
import { creditWords, credits, jobAt, retreatWords, stageWords } from './job-words';

/** The hub's refusals of a start, in the player's words; any other is shown as the hub put it. */
const REFUSALS: Readonly<Record<string, string>> = {
  ADVENTURE_OPEN: 'An adventure is already under way. Only one can be open at a time.',
  NO_SUCH_JOB: 'This job is not on the board any more.',
  PARTY_SIZE: `A party is one to ${MAX_PARTY} heroes.`,
  NOT_YOUR_HERO: 'A hero in the party is not yours.',
  HERO_NOT_HERE: 'A hero in the party is not at this camp.',
  HERO_DEAD: 'A hero in the party is dead.',
  HERO_RETIRED: 'A hero in the party has retired.',
  HERO_ADVENTURING: 'A hero in the party is already on an adventure.',
  CONFLICT: 'The party changed while setting out, and nobody left. Try again.',
};

/**
 * A job's detail under the poster that lists it, the job board,
 * `/camp/<location>/job-board/jobs/<id>`, or a facility the camp has built,
 * such as `/camp/<location>/mine/jobs/<id>`, so the menu keeps the poster
 * marked (Issue-115, refined by Issue-109; Issue-133): its stages in order; what it credits, each beside the camp's
 * balance and the room left under the warehouse's cap ("Resources"); its
 * retreat penalty in words; then the party pick, one to four of the camp's
 * living heroes in no order, since a unit type's home line places it; and
 * Depart, which starts it and goes to `/adventure`. A refusal is shown in
 * place, under Depart.
 */
@Component({
  selector: 'heat-job-panel',
  imports: [LowerCasePipe, RouterLink],
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
  protected readonly reward = computed(() => {
    const job = this.job();
    const camp = this.game.camp();
    if (!job) return [];
    return credits(job).map((credit) => {
      const balance = camp?.holdings.find((h) => h.material === credit.material)?.balance ?? 0;
      const words = creditWords(credit);
      return { material: credit.material, words: words.charAt(0).toUpperCase() + words.slice(1), balance, room: Math.max(0, (camp?.resourceCapacity ?? 0) - balance) };
    });
  });
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
  protected readonly refusal = signal<string | null>(null);

  protected words(stage: Stage): string {
    return stageWords(stage);
  }

  protected toggle(id: string): void {
    const next = new Set(this.picked());
    if (next.has(id)) next.delete(id);
    else if (next.size < MAX_PARTY) next.add(id);
    this.chosen.set(next);
  }

  protected async depart(jobId: string): Promise<void> {
    this.refusal.set(null);
    try {
      await this.game.startAdventure(this.game.location(), jobId, [...this.picked()]);
      await this.router.navigate(['/adventure']);
    } catch (e) {
      const code = e instanceof ApiError ? e.code : null;
      const facility = this.job()?.facility;
      // The facility that posts the job is not built: the hub's rule, as Issue-133 gave it.
      const words = code === 'REQUIRES' && facility ? `Build the ${FACILITIES[facility].name.toLowerCase()} first.` : code && REFUSALS[code];
      this.refusal.set(words ?? (e instanceof Error ? e.message : String(e)));
    }
  }
}
