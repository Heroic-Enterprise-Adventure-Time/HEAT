import { inputBinding } from '@angular/core';
import { render, screen, within } from '@testing-library/angular/zoneless';

import { must } from '@heat/engine';

import { FRAME_LOOP } from '../frame-loop';
import { REDUCED_MOTION } from '../reduced-motion';
import { fakeFrameLoop } from '../testing/fake-battle';
import { fakeIcons } from '../testing/fake-icons';
import { wordsOf } from '../testing/texts-of';
import { COUNT_MS } from './count-up';
import { type GainedHero, type GainedResource, Gains } from './gains';

const TIMBER_AND_CLOTH: readonly GainedResource[] = [
  { material: 'timber', amount: 60 },
  { material: 'cloth', amount: 3 },
];
/** Wat gains a level, Wren gains XP and no level, and Bram died. */
const PARTY: readonly GainedHero[] = [
  { id: 'h1', hero: { name: 'Wat', unitType: 'fighter', level: 1, spriteSet: 'fighter-02' }, xp: 15, level: 2, died: false },
  { id: 'h2', hero: { name: 'Wren', unitType: 'villager', level: 1, spriteSet: 'villager-01' }, xp: 8, level: 1, died: false },
  { id: 'h3', hero: { name: 'Bram', unitType: 'knight', level: 3, spriteSet: 'knight-06' }, xp: 0, level: 3, died: true },
];

async function renderGains(lessMotion = false, resources = TIMBER_AND_CLOTH, heroes = PARTY) {
  const frames = fakeFrameLoop();
  const { fixture } = await render(Gains, {
    bindings: [inputBinding('resources', () => resources), inputBinding('heroes', () => heroes)],
    providers: [fakeIcons, { provide: FRAME_LOOP, useValue: frames.loop }, { provide: REDUCED_MOTION, useValue: () => lessMotion }],
  });
  const run = async (ms: number) => {
    frames.advance(ms);
    await fixture.whenStable();
  };
  return { run };
}

const items = (list: string) => within(screen.getByRole('list', { name: list })).getAllByRole('listitem');
/** An item of a list by its place, to look inside: what counts is hidden from a screen reader, so it is found by its text and by no role. */
const item = (list: string, index: number) => within(must(items(list)[index], `item ${index} of ${list}`));

describe('Gains', () => {
  it('counts each amount up from nothing, one after the other, in the order shown', async () => {
    const { run } = await renderGains();
    expect(item('Resources', 0).getByText('0')).toBeInTheDocument();
    expect(item('Resources', 1).getByText('0')).toBeInTheDocument();
    expect(item('Heroes', 0).getByText('+0 XP')).toBeInTheDocument();

    // Half way through the first amount's time it is past half way, and the next has not begun.
    await run(COUNT_MS / 2);
    expect(item('Resources', 0).getByText('45')).toBeInTheDocument();
    expect(item('Resources', 1).getByText('0')).toBeInTheDocument();

    await run(COUNT_MS / 2);
    expect(item('Resources', 0).getByText('60')).toBeInTheDocument();
    expect(item('Resources', 1).getByText('0')).toBeInTheDocument();

    await run(COUNT_MS);
    expect(item('Resources', 1).getByText('3')).toBeInTheDocument();
    expect(item('Heroes', 0).getByText('+0 XP')).toBeInTheDocument();

    await run(2 * COUNT_MS);
    expect(item('Heroes', 0).getByText('+15 XP')).toBeInTheDocument();
    expect(item('Heroes', 1).getByText('+8 XP')).toBeInTheDocument();
  });

  it('shows a hero at the level it had until its XP is whole, then at its new level with the mark of a level up', async () => {
    const { run } = await renderGains();
    await run(3 * COUNT_MS - 10);
    expect(item('Heroes', 0).getByText('fighter, level 1')).toBeInTheDocument();
    expect(screen.queryByText('Level up')).not.toBeInTheDocument();

    await run(10);
    expect(item('Heroes', 0).getByText('fighter, level 2')).toBeInTheDocument();
    expect(item('Heroes', 0).getByText('Level up')).toBeInTheDocument();

    // Wren's XP is whole too, and gave no level.
    await run(COUNT_MS);
    expect(item('Heroes', 1).getByText('villager, level 1')).toBeInTheDocument();
    expect(screen.getAllByText('Level up')).toHaveLength(1);
  });

  it('says a hero who died died, and counts nothing for it', async () => {
    const { run } = await renderGains();
    expect(item('Heroes', 2).getByText('died')).toBeInTheDocument();
    await run(10 * COUNT_MS);
    expect(item('Heroes', 2).getByText('died')).toBeInTheDocument();
    expect(item('Heroes', 2).queryByText(/XP$/)).not.toBeInTheDocument();
  });

  it('gives a screen reader each whole gain in words from the start, and never the counting', async () => {
    const heard = { resources: ['60 timber', '3 cloth'], heroes: ['Wat, fighter, level 2: +15 XP, level up', 'Wren, villager, level 1: +8 XP', 'Bram, knight, level 3: died'] };
    const { run } = await renderGains();
    expect(wordsOf(items('Resources'))).toEqual(heard.resources);
    expect(wordsOf(items('Heroes'))).toEqual(heard.heroes);
    // The chip's icon is among what counts: it has a name, and no role finds it.
    expect(screen.queryByRole('img')).not.toBeInTheDocument();

    await run(COUNT_MS / 2);
    expect(wordsOf(items('Resources'))).toEqual(heard.resources);
    await run(10 * COUNT_MS);
    expect(wordsOf(items('Resources'))).toEqual(heard.resources);
    expect(wordsOf(items('Heroes'))).toEqual(heard.heroes);
  });

  it('shows every amount whole at once for a player who asked for less motion', async () => {
    const { run } = await renderGains(true);
    expect(item('Resources', 0).getByText('60')).toBeInTheDocument();
    expect(item('Resources', 1).getByText('3')).toBeInTheDocument();
    expect(item('Heroes', 0).getByText('+15 XP')).toBeInTheDocument();
    expect(item('Heroes', 0).getByText('fighter, level 2')).toBeInTheDocument();
    expect(item('Heroes', 0).getByText('Level up')).toBeInTheDocument();
    await run(COUNT_MS);
    expect(item('Resources', 0).getByText('60')).toBeInTheDocument();
  });

  it('lists nothing where nothing of a kind was gained', async () => {
    await renderGains(false, [], []);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
