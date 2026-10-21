import { HEADER_PX, iconScale, isSideBySide, menuLabels, panelPx, sceneScale, sceneView, stackedStageHeight } from './page-layout';

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
});

describe('sceneView', () => {
  it('fills the box with ground around the map, centred, at a whole-number scale', () => {
    // 1000×744 CSS px at scale 2 shows 500×372 art pixels: 50 to each side of the map, 73 above.
    expect(sceneView(1000, 744)).toEqual({ scale: 2, width: 500, height: 372, mapX: 50, mapY: 73 });
  });

  it('covers an odd box by rounding the window up, never leaving a bar', () => {
    const view = sceneView(1001, 745);
    expect(view.width * view.scale).toBeGreaterThanOrEqual(1001);
    expect(view.height * view.scale).toBeGreaterThanOrEqual(745);
  });

  it('crops the edges of the map evenly in a box narrower than it', () => {
    expect(sceneView(375, 225)).toEqual({ scale: 1, width: 375, height: 225, mapX: -13, mapY: 0 });
    // An upright tablet at scale 2 shows 384 of the 400 px: 8 cropped from each side.
    expect(sceneView(768, 450)).toEqual({ scale: 2, width: 384, height: 225, mapX: -8, mapY: 0 });
  });
});
