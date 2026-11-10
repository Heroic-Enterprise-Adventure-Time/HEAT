import { TilesetJsonSchema } from './camp/scene/ground';
import { fetchJson } from './static-json';

const tileset = {
  tile_size: { width: 16, height: 16 },
  tileset_data: { tiles: [{ corners: { NE: 'upper', NW: 'lower', SE: 'lower', SW: 'lower' }, bounding_box: { x: 0, y: 0, width: 16, height: 16 } }] },
};

/** A fetch that answers every request with the body and the status. */
const answering = (body: unknown, status = 200): typeof fetch => () => Promise.resolve(new Response(JSON.stringify(body), { status }));

describe('fetchJson', () => {
  it('answers a static file that matches its schema', async () => {
    await expect(fetchJson('/art/ground/meadow-01/tileset.json', TilesetJsonSchema, answering(tileset))).resolves.toEqual(tileset);
  });

  it('refuses a file that does not, naming it', async () => {
    const wrong = { ...tileset, tileset_data: { tiles: [{ corners: { NE: 'middle', NW: 'lower', SE: 'lower', SW: 'lower' } }] } };
    await expect(fetchJson('/art/ground/meadow-01/tileset.json', TilesetJsonSchema, answering(wrong))).rejects.toThrow(
      /^\/art\/ground\/meadow-01\/tileset\.json is not what the page reads/,
    );
  });

  it('refuses a body that is not JSON, naming the file', async () => {
    const page: typeof fetch = () => Promise.resolve(new Response('<!doctype html><html></html>', { status: 200 }));
    await expect(fetchJson('/art/ground/none/tileset.json', TilesetJsonSchema, page)).rejects.toThrow('/art/ground/none/tileset.json is not JSON');
  });

  it('refuses a file the server did not find', async () => {
    await expect(fetchJson('/art/ground/none/tileset.json', TilesetJsonSchema, answering({}, 404))).rejects.toThrow('GET /art/ground/none/tileset.json answered 404');
  });
});
