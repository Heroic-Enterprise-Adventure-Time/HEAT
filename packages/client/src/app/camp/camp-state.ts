import { Injectable, computed, inject, signal } from '@angular/core';
import { FACILITIES, location, type FacilityKind } from '@heat/engine';
import { Game } from '../game';
import { LAYOUTS } from './scene/layout';

export interface FacilityEntry {
  readonly kind: FacilityKind;
  readonly name: string;
  readonly description: string;
  /** 0 until the camp builds it; building is Issue-93, so every buildable facility is 0 for now. */
  readonly level: number;
}

/**
 * What the camp and its panels share while one camp is on screen: its layout,
 * its facilities with their levels, the hero just recruited, who walks out
 * of the hall, and the hero just retired, who walks back in. Provided by the
 * camp component, so it lives as long as the camp does and each panel the
 * router puts in it reads the same one.
 */
@Injectable()
export class CampState {
  private readonly game = inject(Game);

  readonly layout = computed(() => LAYOUTS[this.game.location()] ?? null);
  /** The camp's facilities in the layout's order, each with its level: built ones at 1, the rest at 0. */
  readonly facilities = computed((): FacilityEntry[] => {
    const content = location(this.game.location());
    const unbuilt = new Set(content?.buildableFacilities ?? []);
    return (this.layout()?.facilities ?? []).map((f) => ({ kind: f.kind, ...FACILITIES[f.kind], level: unbuilt.has(f.kind) ? 0 : 1 }));
  });
  /** The hero the hall just recruited, whom the scene walks out of the hall's door. */
  readonly arriving = signal<string | undefined>(undefined);
  /** The hero just retired, whom the scene walks back into the hall. */
  readonly leaving = signal<string | undefined>(undefined);

  facility(kind: string | null | undefined): FacilityEntry | undefined {
    return this.facilities().find((f) => f.kind === kind);
  }
}
