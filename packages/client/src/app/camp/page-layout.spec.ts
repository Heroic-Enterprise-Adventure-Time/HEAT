import { HEADER_PX, heroScale, iconScale, isSideBySide, menuLabels, panelPx, sceneScale, sceneView, stackedStageHeight } from './page-layout';

// Typical browser viewports, the header's height included in the height.
const LAPTOP = [1366, 614 + HEADER_PX] as const;
const MACBOOK = [1440, 744 + HEADER_PX] as const;
const DESKTOP = [1920, 914 + HEADER_PX] as const;
const TABLET = [1024, 768] as const;
const PHONE = [375, 812] as const;
const BIG = [2560, 1274 + HEADER_PX] as const;

describe('sceneScale', () => {
  it('takes the largest whole number at which the map height and its 352 px core width fit', () => {
    expect(sceneScale(1336, 914)).toBe(3);
    expect(sceneScale(1000, 744)).toBe(2);
    expect(sceneScale(800, 450)).toBe(2);
  });

  it('never goes below 1, so a narrow phone still draws the scene', () => {
    expect(sceneScale(300, 100)).toBe(1);
  });
});

describe('panelPx', () => {
  it('is 26% of the window, held between 17rem and 28rem', () => {
    expect(panelPx(1366)).toBeCloseTo(355.16);
    expect(panelPx(1920)).toBe(448);
    expect(panelPx(900)).toBe(272);
  });
});

describe('isSideBySide', () => {
  it('stands the regions side by side where the scene still gets scale 2', () => {
    expect(isSideBySide(...LAPTOP)).toBe(true);
    expect(isSideBySide(...MACBOOK)).toBe(true);
    expect(isSideBySide(...DESKTOP)).toBe(true);
  });

  it('stacks them on a tablet, a small window and a phone', () => {
    // 1024×768 side by side would leave the scene 696 px wide: scale 1.
    expect(isSideBySide(...TABLET)).toBe(false);
    expect(isSideBySide(1000, 500)).toBe(false);
    expect(isSideBySide(...PHONE)).toBe(false);
  });
});

describe('menuLabels and iconScale', () => {
  it('labels the menu where that costs the scene no scale step', () => {
    // 1366×650: the rail leaves 955 px and labels 795 px, scale 2 either way.
    expect(menuLabels(...LAPTOP)).toBe(true);
    expect(menuLabels(...MACBOOK)).toBe(true);
    expect(menuLabels(...BIG)).toBe(true);
  });

  it('keeps the icon rail where labels would cost a step, and never labels a stacked menu', () => {
    // 1920×950: the rail leaves 1416 px, scale 4; labels leave 1256 px, scale 3.
    expect(menuLabels(...DESKTOP)).toBe(false);
    expect(menuLabels(...TABLET)).toBe(false);
    expect(menuLabels(...PHONE)).toBe(false);
  });

  it('draws the icons at 2× in a labelled menu beside a scene at scale 3 or more', () => {
    expect(iconScale(...BIG)).toBe(2);
    expect(iconScale(...MACBOOK)).toBe(1);
    expect(iconScale(...DESKTOP)).toBe(1);
  });
});

describe('stackedStageHeight', () => {
  it('is the map height at the scale that fits both the width and the height under the header and menu row', () => {
    expect(stackedStageHeight(...PHONE)).toBe(225);
    expect(stackedStageHeight(...TABLET)).toBe(450);
    // An upright tablet: 768 px holds the 352 px core twice.
    expect(stackedStageHeight(768, 1024)).toBe(450);
    // Wide but short: the height allows scale 1 only.
    expect(stackedStageHeight(1000, 500)).toBe(225);
  });

  it('counts the scale in device pixels and gives the height back in CSS pixels', () => {
    // A tablet at 125%: 1280 device px across and 835 down hold the map at 3, 540 CSS px.
    expect(stackedStageHeight(...TABLET, 1.25)).toBe(540);
    expect(stackedStageHeight(...TABLET, 1.5)).toBe(600);
    expect(stackedStageHeight(...TABLET, 2)).toBe(562.5);
    // A phone at ratio 3: the map at 3 device px, one CSS px, as at ratio 1.
    expect(stackedStageHeight(...PHONE, 3)).toBe(225);
  });
});

describe('heroScale', () => {
  it('is half the scene scale, rounded up to a whole number', () => {
    expect([1, 2, 3, 4, 5, 6].map((s) => heroScale(s))).toEqual([1, 1, 2, 2, 3, 3]);
  });

  it('never falls below one CSS pixel per art pixel, nor rises above the scene', () => {
    expect([2, 3, 4, 5, 6].map((s) => heroScale(s, 1.25))).toEqual([1, 2, 2, 3, 3]);
    expect([2, 3, 4, 5, 6].map((s) => heroScale(s, 1.5))).toEqual([2, 2, 2, 3, 3]);
    expect([2, 3, 4, 5, 6].map((s) => heroScale(s, 2))).toEqual([2, 2, 2, 3, 3]);
    // A phone at ratio 3 with the scene at 3 device px: the heroes at the scene's scale, as at scene scale 1.
    expect(heroScale(3, 3)).toBe(3);
    expect(heroScale(2, 3)).toBe(2);
  });
});

describe('sceneView', () => {
  it('fills the box with ground around the map, centred, at a whole-number scale', () => {
    // 1000×744 CSS px at scale 2 shows 500×372 art pixels: 50 to each side of the map, 73 above.
    expect(sceneView(1000, 744)).toEqual({ scale: 2, heroScale: 1, width: 500, height: 372, mapX: 50, mapY: 73 });
  });

  it('covers an odd box by rounding the window up, never leaving a bar', () => {
    const view = sceneView(1001, 745);
    expect(view.width * view.scale).toBeGreaterThanOrEqual(1001);
    expect(view.height * view.scale).toBeGreaterThanOrEqual(745);
  });

  it('counts device pixels, so every art pixel is the same whole number of them at any ratio', () => {
    // The box of a 1366×650 laptop's scene, 955×614 CSS px, at each ratio.
    const at = (ratio: number) => sceneView(Math.round(955 * ratio), Math.round(614 * ratio), ratio);
    expect(at(1)).toMatchObject({ scale: 2, heroScale: 1 });
    // 1194×768 device px: 3 per art pixel, not 2.5.
    expect(at(1.25)).toMatchObject({ scale: 3, heroScale: 2, width: 398, height: 256 });
    expect(at(1.5)).toMatchObject({ scale: 4, heroScale: 2 });
    expect(at(2)).toMatchObject({ scale: 5, heroScale: 3 });
    for (const ratio of [1, 1.25, 1.5, 2]) {
      const view = at(ratio);
      expect(view.width * view.scale).toBeGreaterThanOrEqual(Math.round(955 * ratio));
      expect(view.height * view.scale).toBeGreaterThanOrEqual(Math.round(614 * ratio));
    }
  });

  it('crops the edges of the map evenly in a box narrower than it', () => {
    expect(sceneView(375, 225)).toEqual({ scale: 1, heroScale: 1, width: 375, height: 225, mapX: -13, mapY: 0 });
    // An upright tablet at scale 2 shows 384 of the 400 px: 8 cropped from each side.
    expect(sceneView(768, 450)).toEqual({ scale: 2, heroScale: 1, width: 384, height: 225, mapX: -8, mapY: 0 });
  });
});
