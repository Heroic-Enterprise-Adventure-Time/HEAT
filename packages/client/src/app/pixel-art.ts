import type { Texture } from 'pixi.js';

/**
 * Reading a texture's pixels, which both scenes need to stand a figure by
 * its feet or a building by its base (docs/process/assets.md, rules 11 and
 * 18). Imported only by the scenes, so it loads with PixiJS.
 */

function opaqueRows(texture: Texture): { top: number; bottom: number } {
  const { width, height } = texture.source;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { top: 0, bottom: height - 1 };
  context.drawImage(texture.source.resource as CanvasImageSource, 0, 0);
  const data = context.getImageData(0, 0, width, height).data;
  const opaque = (y: number) => {
    for (let x = 0; x < width; x++) if ((data[(y * width + x) * 4 + 3] ?? 0) > 0) return true;
    return false;
  };
  let bottom = height - 1;
  while (bottom > 0 && !opaque(bottom)) bottom--;
  let top = 0;
  while (top < bottom && !opaque(top)) top++;
  return { top, bottom };
}

/** The row of the lowest pixel that is not transparent: where a figure's feet or a building's base are. */
export function lowestOpaqueRow(texture: Texture): number {
  return opaqueRows(texture).bottom;
}

/** The row of the highest pixel that is not transparent: the top of a picture. */
export function highestOpaqueRow(texture: Texture): number {
  return opaqueRows(texture).top;
}
