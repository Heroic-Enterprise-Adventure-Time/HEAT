import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Api } from './api';
import { Config } from './config';
import { Game, type AdventureView, type PlayerView, type SettledView } from './game';
import { RELOAD, RELOADED_FROM, Updates } from './updates';

const adventure: AdventureView = {
  id: 'a1',
  startedAt: '2026-10-22T07:00:00.000Z',
  location: 'millbrook',
  seed: 's1',
  version: 'v1',
  job: { id: 'wolves-on-the-mill-road', name: 'Wolves on the mill road', description: 'Two wolves.' },
  snapshot: { version: 'v1', jobId: 'wolves-on-the-mill-road', heroes: [] },
};

const player = (open: AdventureView | null): PlayerView => ({ id: 'p1', camps: [], heroes: [], openAdventure: open });

function setup(loaded: PlayerView | null, version = 'v1') {
  const reloads = { count: 0 };
  const api = { outdated: signal(false) };
  const game = { player: signal(loaded), settled: signal<SettledView | null>(null) };
  TestBed.configureTestingModule({
    providers: [
      { provide: Api, useValue: api },
      { provide: Game, useValue: game },
      { provide: Config, useValue: { value: signal({ version }) } },
      {
        provide: RELOAD,
        useValue: () => {
          reloads.count++;
        },
      },
    ],
  });
  TestBed.inject(Updates);
  TestBed.tick();
  return { api, game, reloads };
}

describe('Updates', () => {
  beforeEach(() => { sessionStorage.clear(); });

  it('reloads at once when the hub says the client is outdated and no adventure is open', () => {
    const { api, reloads } = setup(player(null));
    expect(reloads.count).toBe(0);
    api.outdated.set(true);
    TestBed.tick();
    expect(reloads.count).toBe(1);
    expect(sessionStorage.getItem(RELOADED_FROM)).toBe('v1');
  });

  it('queues the reload while an adventure is open, and reloads once it has closed', () => {
    const { api, game, reloads } = setup(player(adventure));
    api.outdated.set(true);
    TestBed.tick();
    expect(reloads.count).toBe(0);
    game.player.set(player(null));
    TestBed.tick();
    expect(reloads.count).toBe(1);
  });

  it('waits while the result of the adventure just ended is on screen, and reloads once the player leaves it', () => {
    const { api, game, reloads } = setup(player(adventure));
    api.outdated.set(true);
    game.settled.set({ adventure, result: null });
    game.player.set(player(null));
    TestBed.tick();
    expect(reloads.count).toBe(0);
    game.settled.set(null);
    TestBed.tick();
    expect(reloads.count).toBe(1);
  });

  it('waits for the player to be read, since an open adventure cannot be ruled out before', () => {
    const { api, game, reloads } = setup(null);
    api.outdated.set(true);
    TestBed.tick();
    expect(reloads.count).toBe(0);
    game.player.set(player(null));
    TestBed.tick();
    expect(reloads.count).toBe(1);
  });

  it('reloads away from a version once, so a page still outdated after the reload does not loop', () => {
    sessionStorage.setItem(RELOADED_FROM, 'v1');
    const { api, reloads } = setup(player(null));
    api.outdated.set(true);
    TestBed.tick();
    expect(reloads.count).toBe(0);
  });

  it('reloads again from a newer version, at the next deploy', () => {
    sessionStorage.setItem(RELOADED_FROM, 'v1');
    const { api, reloads } = setup(player(null), 'v2');
    api.outdated.set(true);
    TestBed.tick();
    expect(reloads.count).toBe(1);
  });
});
