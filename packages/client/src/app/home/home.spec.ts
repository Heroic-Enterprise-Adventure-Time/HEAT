import { TestBed } from '@angular/core/testing';
import { Home } from './home';

describe('Home', () => {
  it('shows the name of the game', async () => {
    await TestBed.configureTestingModule({ imports: [Home] }).compileComponents();
    const fixture = TestBed.createComponent(Home);
    await fixture.whenStable();
    const page = fixture.nativeElement as HTMLElement;
    expect(page.querySelector('h1')?.textContent).toBe('HEAT');
  });
});
