import { HEADER_PX, isLandscape, menuLabels, sceneScale } from './page-layout';

describe('sceneScale', () => {
  it('takes the largest whole number that fits both ways', () => {
    expect(sceneScale(1920, 914)).toBe(5);
    expect(sceneScale(1366, 614)).toBe(3);
    expect(sceneScale(1280, 720)).toBe(4);
  });

  it('never goes below 1, so a narrow phone still draws the scene', () => {
    expect(sceneScale(300, 100)).toBe(1);
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
  // Typical browser viewports, the header's height included in the height.
  it('shows the labels where they cost the scene no scale step', () => {
    expect(menuLabels(1920, 914 + HEADER_PX)).toBe(true);
    expect(menuLabels(1366, 614 + HEADER_PX)).toBe(true);
    expect(menuLabels(1536, 694 + HEADER_PX)).toBe(true);
    expect(menuLabels(2560, 1274 + HEADER_PX)).toBe(true);
  });

  it('keeps the icon rail where the labels would cost a step', () => {
    // 1440×900: the rail leaves 1384 px, scale 4; labels leave 1240 px, scale 3.
    expect(menuLabels(1440, 744 + HEADER_PX)).toBe(false);
  });

  it('never labels the side menu on a portrait screen, where it is a tab bar', () => {
    expect(menuLabels(375, 812)).toBe(false);
    expect(menuLabels(768, 1024)).toBe(false);
  });
});
