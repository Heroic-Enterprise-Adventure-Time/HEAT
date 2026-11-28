import { LowerCasePipe } from '@angular/common';
import { Component, computed, inject, linkedSignal, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { sumBy } from 'es-toolkit';

import { FACILITIES, type Material, MAX_PARTY } from '@heat/engine';

import { Game, type StartRefusal } from '../../game';
import { Refusal, refusalWords } from '../../hub';
import { BackLink } from '../../primitives/back-link';
import { HeroTile } from '../../primitives/hero-tile';
import { Icon } from '../../primitives/icon';
import { type MoreItem, MoreMenu } from '../../primitives/more-menu';
import { ResourceChip } from '../../primitives/resource-chip';
import { caravanReason, cargoLines, cargoRows, cartCapacityAt, loadWords, noWayBackWords, roomWords } from './caravan-words';
import { bonusWords, lockedWords, NO_PAY, retreatWords } from './job-words';
import { loadLastParty, saveLastParty } from './last-party';
import { injectRoutedJob } from './routed-job';

/**
 * The hub's refusals of a start, by type, in the player's words; any other is
 * shown as the hub put it. A job the location does not post, a party of the
 * wrong size or a hero that is not the player's are the client's own
 * defects, refused as BAD_USER_INPUT, and this panel never sends them; so
 * are a caravan's cargo over its cart and a destination the player has no
 * camp at, which the page checks before asking. A caravan's two, a cargo the
 * camp cannot pay and a destination hall with no room for who stays, come
 * back where another start or a build took the balance or the slot since the
 * page last read the camp.
 */
const REFUSALS: Readonly<Record<Exclude<StartRefusal, 'Requires'>, string>> = {
  AdventureOpen: 'An adventure is already under way. Only one can be open at a time.',
  InsufficientResources: 'The camp cannot pay for the cargo now.',
  HallFull: 'The heroes hall at the destination has no room for everyone who stays.',
  HeroNotHere: 'One of the heroes picked is not at this camp.',
  HeroDead: 'One of the heroes picked is dead.',
  HeroRetired: 'One of the heroes picked has retired.',
  HeroAdventuring: 'One of the heroes picked is already on an adventure.',
  Conflict: 'The party changed while setting out, and nobody left. Try again.',
};

// The two groups of who stays at a caravan's destination (Issue-391), and what the riders' group says of itself.
const ESCORTS_TITLE = 'Of the party';
const RIDERS_TITLE = 'Riding along';
const RIDERS_NOTE = 'A rider stays without fighting on the way.';
const NO_RIDERS = 'Nobody else is here to ride.';

/**
 * A job's detail under the poster that lists it, the job board,
 * `/camp/<location>/job-board/jobs/<id>`, or a facility the camp has built,
 * such as `/camp/<location>/mine/jobs/<id>`, so the menu keeps the poster
 * marked (Issue-115, refined by Issue-109; Issue-133): its description,
 * which is all the page tells of what the job holds; its pay, as resource
 * chips, each beside the room left under the warehouse's cap ("Resources"),
 * and its bonus XP; what a retreat keeps, in words; and never its stages nor
 * what its enemies drop, so the room is shown for the pay alone (decision
 * 0058; the owner, 2026-11-20, Issue-339, on the stages); then the party
 * pick, one to four of the camp's living heroes as hero tiles in no order,
 * since a unit type's home line places it, opening with the last party sent
 * on the job picked, less whoever of it is not alive here now (Issue-440;
 * decision 0064); and Depart, which starts it and
 * goes to `/adventure`. A refusal is shown in place, under Depart. The job's
 * replays are behind the panel's "more" menu, at `<job>/replays`
 * (`JobReplaysPanel`; decision 0061).
 *
 * A caravan's page is a job's page with two more picks (Issue-355; game.md,
 * "Caravans"): the cargo, an amount of each resource the camp holds, set by
 * steppers clamped to the balance and to what the cart carries, each beside
 * the camp's balance and the destination's room for it (Issue-386); and who
 * stays at the destination, as hero tiles in two groups beside its hall's
 * free slots, the party's heroes and everyone else here, who would ride
 * along (Issue-391). Under them, what cannot be undone: that a retreat abandons the
 * cargo, which the retreat's line says, and where the destination has no
 * caravan hub, that a hero who stays cannot come back until it has one.
 * Depart is disabled with the reason while the picks break a rule the hub
 * checks again. A caravan to a location the player has not unlocked, and a
 * job its facility's level does not post yet (Issue-357), says what it needs
 * in place of the picks.
 */
@Component({
  selector: 'heat-job-panel',
  imports: [BackLink, HeroTile, Icon, LowerCasePipe, MoreMenu, ResourceChip, RouterLink],
  templateUrl: './job-panel.html',
  styleUrl: './panel.css',
})
export class JobPanel {
  protected readonly game = inject(Game);
  private readonly router = inject(Router);
  protected readonly maxParty = MAX_PARTY;

  private readonly routed = injectRoutedJob();
  protected readonly posterName = this.routed.posterName;
  protected readonly job = this.routed.job;
  /** The job's secondary views, behind its "more" menu (decision 0061): its replays, a child of its route. */
  protected readonly more: readonly MoreItem[] = [{ label: 'Replays', to: 'replays' }];
  /** What a job with no pay says in its place, from the same words as the board's list. */
  protected readonly noPay = NO_PAY;
  /** The job's pay, each resource of it beside the room the warehouse has left for it: the one thing a chip cannot say. */
  protected readonly pay = computed(() => {
    const camp = this.game.camp();
    return (this.job()?.pay ?? []).map((reward) => {
      const balance = camp?.holdings.find((h) => h.material === reward.material)?.balance ?? 0;
      return { material: reward.material, amount: reward.amount, room: Math.max(0, (camp?.resourceCapacity ?? 0) - balance) };
    });
  });
  protected readonly bonus = computed(() => {
    const job = this.job();
    return job ? bonusWords(job) : '';
  });
  protected readonly retreat = computed(() => {
    const job = this.job();
    return job ? retreatWords(job) : '';
  });

  /** The camp a caravan delivers to, or null for a job that delivers nothing and for a destination the player has no camp at. */
  protected readonly destination = computed(() => {
    const to = this.job()?.deliversTo;
    return (to && this.game.player()?.camps.find((c) => c.location === to)) ?? null;
  });
  /** What a job its facility's level does not post yet needs, or a caravan to a location the player has not unlocked, once the player is read (`lockedWords`). */
  protected readonly locked = computed(() => {
    const job = this.job();
    const camp = this.game.camp();
    return job && camp ? lockedWords(job, this.game.player()?.camps.map((c) => c.location) ?? null, camp.facilities) : null;
  });
  /** Each resource the camp can load, beside its balance and the destination's room for it. */
  protected readonly cargoLines = computed(() => {
    const origin = this.game.camp();
    const destination = this.destination();
    return origin && destination ? cargoLines(origin, destination) : [];
  });
  private readonly amounts = signal<ReadonlyMap<Material, number>>(new Map());
  /** Each line's stepper, clamped to the camp's balance and the cart's room. */
  protected readonly cargoRows = computed(() => {
    const origin = this.game.camp();
    return origin ? cargoRows(this.cargoLines(), this.amounts(), cartCapacityAt(origin)) : [];
  });
  /** The cargo as the start sends it: each resource still offered, at the amount picked, and none at 0. */
  private readonly cargo = computed(() =>
    this.cargoLines().flatMap(({ material }) => {
      const amount = this.amounts().get(material) ?? 0;
      return amount === 0 ? [] : [{ material, amount }];
    }),
  );
  protected readonly load = computed(() => {
    const origin = this.game.camp();
    return origin ? loadWords(sumBy(this.cargo(), (c) => c.amount), cartCapacityAt(origin)) : '';
  });
  protected readonly room = computed(() => {
    const destination = this.destination();
    return destination ? roomWords(destination) : '';
  });
  protected readonly noWayBack = computed(() => {
    const destination = this.destination();
    return destination && noWayBackWords(destination);
  });

  /**
   * The heroes chosen, by id. A job's page opens with the last party sent on
   * that job from this camp, as this browser kept it (`last-party.ts`;
   * Issue-440), and starts from that again whenever the address names another
   * job; `picked` leaves out whoever of it is no longer alive here.
   */
  private readonly chosen = linkedSignal<string | undefined, ReadonlySet<string>>({
    source: () => this.job()?.id,
    computation: (jobId) => new Set(jobId ? loadLastParty(this.game.location(), jobId) : []),
  });
  /** The heroes picked who are still alive here: a refusal reloads the camp, and one may have gone, as may one of the last party. */
  protected readonly picked = computed(() => {
    const living = new Set(this.game.livingHere().map((h) => h.id));
    return new Set([...this.chosen()].filter((id) => living.has(id)));
  });
  /**
   * The heroes who may be marked to stay, in the camp's order, in two groups
   * (Issue-391, amending decision 0059): the party's, who fight on the way,
   * and every other living hero here, who would ride along in the cart.
   */
  protected readonly escorts = computed(() => this.game.livingHere().filter((h) => this.picked().has(h.id)));
  protected readonly riders = computed(() => this.game.livingHere().filter((h) => !this.picked().has(h.id)));
  protected readonly escortsTitle = ESCORTS_TITLE;
  protected readonly ridersTitle = RIDERS_TITLE;
  protected readonly ridersNote = RIDERS_NOTE;
  protected readonly noRiders = NO_RIDERS;
  private readonly marked = signal<ReadonlySet<string>>(new Set());
  /** The heroes marked to stay who are still alive here, of the party or riding. */
  protected readonly staying = computed(() => {
    const living = new Set(this.game.livingHere().map((h) => h.id));
    return new Set([...this.marked()].filter((id) => living.has(id)));
  });
  /** Why the caravan cannot depart as picked, or null; always null for a job that delivers nothing. */
  protected readonly caravanReason = computed(() => {
    const origin = this.game.camp();
    const destination = this.destination();
    return origin && destination ? caravanReason(origin, destination, this.cargo(), this.staying().size) : null;
  });
  /** Whether the party is setting out, while the hub answers. */
  protected readonly pending = signal(false);
  protected readonly refusal = signal<string | null>(null);

  /**
   * A hero who leaves the party leaves the caravan: it is no longer marked
   * to stay, so that nobody becomes a rider, and moves camp, by a pick that
   * meant the opposite. One who joins the party keeps its mark, and stays as
   * a hero of the party where it would have ridden.
   */
  protected toggle(id: string): void {
    const next = new Set(this.picked());
    if (next.has(id)) {
      next.delete(id);
      this.marked.set(new Set([...this.staying()].filter((stays) => stays !== id)));
    } else if (next.size < MAX_PARTY) {
      next.add(id);
    }
    this.chosen.set(next);
  }

  /** An amount as a stepper set it, already clamped (`cargoRows`). */
  protected setAmount(material: Material, amount: number): void {
    const next = new Map(this.amounts());
    next.set(material, amount);
    this.amounts.set(next);
  }

  protected toggleStay(id: string): void {
    const next = new Set(this.staying());
    if (next.has(id)) next.delete(id);
    else next.add(id);
    this.marked.set(next);
  }

  protected async depart(jobId: string): Promise<void> {
    this.refusal.set(null);
    this.pending.set(true);
    try {
      const caravan = this.destination() ? { cargo: this.cargo(), staying: [...this.staying()] } : undefined;
      const location = this.game.location();
      const party = [...this.picked()];
      await this.game.startAdventure(location, jobId, party, caravan);
      // Kept only once the party has left: a refused party is not the last one sent.
      saveLastParty(location, jobId, party);
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
