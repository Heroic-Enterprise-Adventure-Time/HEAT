import { Component, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { FACILITIES, type FacilityKind, type Stage } from '@heat/engine';
import { ApiError } from '../../api';
import { Game } from '../../game';
import { CampState } from '../camp-state';
import { creditWords, credits, jobAt, retreatWords, stageWords } from './job-words';

/** The most heroes a party takes (game.md, "The battle"); the hub refuses more with PARTY_SIZE. */
export const MAX_PARTY = 4;

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
  imports: [RouterLink],
  template: `
    <a class="back" routerLink="../..">← {{ posterName() }}</a>
    @if (job(); as job) {
      <h2 id="panel-title">{{ job.name }}</h2>
      <p>{{ job.description }}</p>

      <h3>Stages</h3>
      <ol class="stages">
        @for (stage of job.stages; track $index) {
          <li>{{ words(stage) }}</li>
        }
      </ol>

      <h3>Reward</h3>
      <ul class="credits">
        @for (credit of reward(); track credit.material) {
          <li>
            {{ credit.words }}. {{ game.camp()?.name }} holds {{ credit.balance }}, with room for {{ credit.room }} more.
          </li>
        }
        <li>{{ job.xp }} XP to each hero who comes back.</li>
      </ul>
      <p class="retreat">{{ retreat() }}</p>

      <h3>Party</h3>
      @if (!game.player()) {
        <p>Loading…</p>
      } @else if (game.adventure(); as adventure) {
        <p class="note">An adventure is under way: <a class="link" routerLink="/adventure">{{ adventure.job.name }}</a>.</p>
      } @else if (game.livingHere().length === 0) {
        <p>
          No hero here is alive. Recruit one at the
          <a class="link" [routerLink]="['/camp', game.location(), 'heroes-hall']">heroes hall</a>.
        </p>
      } @else {
        <p>Pick one to {{ maxParty }} heroes.</p>
        <ul class="party">
          @for (hero of game.livingHere(); track hero.id) {
            <li>
              <label>
                <input
                  type="checkbox"
                  [checked]="picked().has(hero.id)"
                  [disabled]="!picked().has(hero.id) && picked().size >= maxParty"
                  (change)="toggle(hero.id)"
                />
                {{ hero.name }}
              </label>
              <span>{{ hero.unitType }}, level {{ hero.level }}</span>
            </li>
          }
        </ul>
        <button type="button" (click)="depart(job.id)" [disabled]="picked().size === 0 || game.busy()">Depart</button>
      }
      @if (refusal(); as refusal) {
        <p class="refusal" role="alert">{{ refusal }}</p>
      }
    } @else {
      <h2 id="panel-title">Job</h2>
      <p>The {{ posterName().toLowerCase() }} has no such job.</p>
    }
  `,
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
      return { material: credit.material, words: words[0]!.toUpperCase() + words.slice(1), balance, room: Math.max(0, (camp?.resourceCapacity ?? 0) - balance) };
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
