import { HEADER_PX, isLandscape, menuLabels, narrowStageHeight, sceneScale, sceneView } from './page-layout';

describe('sceneScale', () => {
  it('takes the largest whole number at which the whole 400×225 map fits', () => {
    expect(sceneScale(1336, 914)).toBe(3);
    expect(sceneScale(1000, 744)).toBe(2);
    expect(sceneScale(800, 450)).toBe(2);
  });

  it('never goes below 1, so a narrow phone still draws the scene', () => {
    expect(sceneScale(300, 100)).toBe(1);
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
  });
});

describe('narrowStageHeight', () => {
  it('is the map height at the width scale', () => {
    expect(narrowStageHeight(375)).toBe(225);
    expect(narrowStageHeight(820)).toBe(450);
  });
});

describe('isLandscape', () => {
  it('starts at 4:3', () => {
    expect(isLandscape(1024, 768)).toBe(true);
    expect(isLandscape(1023, 768)).toBe(false);
    expect(isLandscape(375, 812)).toBe(false);
  });
});

describe('menuLabels', () => {
  // Typical browser viewports, the header's height included; the 24rem panel always beside the scene.
  it('shows the labels where they cost the scene no scale step', () => {
    // 1920×950: the rail leaves 1480 px and labels 1336 px, scale 3 either way.
    expect(menuLabels(1920, 914 + HEADER_PX)).toBe(true);
  });

  it('keeps the icon rail where the labels would cost a step', () => {
    // 2560×1310: the rail leaves 2120 px, scale 5; labels leave 1976 px, scale 4.
    expect(menuLabels(2560, 1274 + HEADER_PX)).toBe(false);
    // 1366×650: the rail leaves 926 px, scale 2; labels leave 782 px, scale 1.
    expect(menuLabels(1366, 614 + HEADER_PX)).toBe(false);
  });

  it('never labels the side menu on a portrait screen, where it is a row', () => {
    expect(menuLabels(375, 812)).toBe(false);
    expect(menuLabels(768, 1024)).toBe(false);
  });
});
