import { Component, computed, input } from '@angular/core';

/**
 * Slot circles (Issue-384): a count of slots as circles, filled for each one
 * taken and empty for each one free, such as a hall's heroes against its
 * room. It is one picture with a name, "2 of 4 heroes", so a screen reader
 * hears the count and not the circles; filled and empty differ by fill, not
 * by colour alone.
 */
@Component({
  selector: 'heat-slots',
  templateUrl: './slots.html',
  styleUrl: './slots.css',
})
export class Slots {
  readonly filled = input.required<number>();
  readonly total = input.required<number>();
  /** What the slots hold, plural, as the name says it: "heroes". */
  readonly of = input.required<string>();
  protected readonly label = computed(() => `${this.filled()} of ${this.total()} ${this.of()}`);
  protected readonly circles = computed(() => Array.from({ length: this.total() }, (_, index) => index < this.filled()));
}
