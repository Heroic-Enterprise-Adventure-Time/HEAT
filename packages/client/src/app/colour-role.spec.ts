import { BAR_ROLES } from './adventure/battle/health-bar';
import { readColourRole } from './colour-role';
import { rootStyle } from './testing/style-tokens';

describe('readColourRole', () => {
  const style = (value: string) => ({ getPropertyValue: () => value });

  it("reads a role as the palette's colour it is mapped onto, as styles.css declares both", () => {
    expect(readColourRole(rootStyle(), '--scene-glyph-outline')).toBe(rootStyle().getPropertyValue('--soot'));
    expect(readColourRole(rootStyle(), '--soot')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('trims what getComputedStyle hands back', () => {
    const soot = rootStyle().getPropertyValue('--soot');
    expect(readColourRole(style(` ${soot} `), '--any')).toBe(soot);
  });

  it('names the token that is missing or is no colour of the palette, since that is a mistake in styles.css', () => {
    expect(() => readColourRole(rootStyle(), '--no-such-role')).toThrow('--no-such-role');
    expect(() => readColourRole(rootStyle(), '--space-xl')).toThrow('--space-xl');
    expect(() => readColourRole(rootStyle(), '--line-edge')).toThrow('--line-edge');
  });

  it("finds every role the battle's health bar is drawn with", () => {
    for (const token of Object.values(BAR_ROLES)) expect(readColourRole(rootStyle(), token)).toMatch(/^#[0-9a-f]{6}$/);
  });
});
