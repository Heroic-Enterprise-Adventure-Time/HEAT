import { must } from '@heat/engine';

import { browserFrames, MAX_FRAME_MS } from './frame-loop';

/** The browser's frames, stood in for: what was asked for and not cancelled, and a way to give the page the next one. */
function fakeBrowserFrames() {
  const asked = new Map<number, FrameRequestCallback>();
  let ids = 0;
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    asked.set(++ids, callback);
    return ids;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    asked.delete(id);
  });
  /** Runs the one frame that is waiting, at that time on the browser's clock. */
  const frame = (now: number) => {
    const [id, callback] = must([...asked][0], 'a frame asked for');
    asked.delete(id);
    callback(now);
  };
  return { waiting: () => asked.size, frame };
}

describe("the browser's frames, as the page's frame loop gives them", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('gives each frame the milliseconds since the last, and at most the longest step a frame may take', () => {
    const browser = fakeBrowserFrames();
    const steps: number[] = [];
    browserFrames((ms) => steps.push(ms));
    // The first frame has no frame before it to measure from.
    browser.frame(1000);
    expect(steps).toEqual([]);
    browser.frame(1016);
    browser.frame(1016 + 10 * MAX_FRAME_MS);
    expect(steps).toEqual([16, MAX_FRAME_MS]);
    expect(browser.waiting()).toBe(1);
  });

  it('asks for no more frames once it is stopped', () => {
    const browser = fakeBrowserFrames();
    const steps: number[] = [];
    const stop = browserFrames((ms) => steps.push(ms));
    browser.frame(1000);
    browser.frame(1016);
    stop();
    expect(browser.waiting()).toBe(0);
    expect(steps).toEqual([16]);
  });

  it('asks for no more frames when it is stopped from inside its own frame, as a count is when its last amount is whole (the review of PR-443)', () => {
    const browser = fakeBrowserFrames();
    let frames = 0;
    let stop = (): void => undefined;
    stop = browserFrames(() => {
      frames += 1;
      if (frames === 2) stop();
    });
    browser.frame(1000);
    browser.frame(1016);
    expect(browser.waiting()).toBe(1);
    browser.frame(1032);
    expect(frames).toBe(2);
    expect(browser.waiting()).toBe(0);
  });
});
