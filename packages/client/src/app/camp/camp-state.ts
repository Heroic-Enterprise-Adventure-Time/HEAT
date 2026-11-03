import { computed, inject, Injectable, signal } from '@angular/core';

import { FACILITIES, type FacilityKind, location } from '@heat/engine';

import { Game } from '../game';
import { LAYOUTS } from './scene/layout';

export interface FacilityEntry {
  readonly kind: FacilityKind;
  readonly name: string;
  readonly description: string;
  /** 0 until the camp builds it; a shared facility is at 1. */
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
  /**
   * The camp's facilities in the layout's order, each with its level as the
   * hub reads it (Issue-93). Before the camp is read, the facilities every
   * camp has stand at 1 and the rest at 0.
   */
  readonly facilities = computed((): FacilityEntry[] => {
    const content = location(this.game.location());
    const unbuilt = new Set(content?.buildableFacilities ?? []);
    const levels = new Map((this.game.camp()?.facilities ?? []).map((f) => [f.kind, f.level]));
    return (this.layout()?.facilities ?? []).map((f) => ({
      kind: f.kind,
      name: FACILITIES[f.kind].name,
      description: FACILITIES[f.kind].description,
      level: levels.get(f.kind) ?? (unbuilt.has(f.kind) ? 0 : 1),
    }));
  });
  /** The hero the hall just recruited, whom the scene walks out of the hall's door. */
  readonly arriving = signal<string | undefined>(undefined);
  /** The hero just retired, whom the scene walks back into the hall. */
  readonly leaving = signal<string | undefined>(undefined);

  facility(kind: string | null | undefined): FacilityEntry | undefined {
    return this.facilities().find((f) => f.kind === kind);
  }
}
