import { Config, parseStackConfig } from './config';

const sample = {
  graphqlPath: '/graphql',
  userPoolId: 'us-east-1_EXAMPLE',
  clientId: '1example23456789',
  loginHost: 'https://auth.heat-sb.dcg-games.com',
  passwordSignIn: true,
};

describe('parseStackConfig', () => {
  it('accepts the five fields', () => {
    expect(parseStackConfig(sample)).toEqual(sample);
  });

  it('names the missing field', () => {
    const { loginHost: _loginHost, ...without } = sample;
    expect(() => parseStackConfig(without)).toThrow('config.json lacks loginHost');
    expect(() => parseStackConfig({ ...sample, passwordSignIn: 'true' })).toThrow('config.json lacks passwordSignIn');
    expect(() => parseStackConfig(null)).toThrow('config.json is not an object');
  });
});

describe('Config.load', () => {
  it('loads config.json without caching it', async () => {
    const config = new Config();
    const calls: [string, RequestInit | undefined][] = [];
    await config.load(async (input, init) => {
      calls.push([String(input), init]);
      return new Response(JSON.stringify(sample), { status: 200 });
    });
    expect(config.value()).toEqual(sample);
    expect(config.error()).toBeNull();
    expect(calls).toEqual([['/config.json', { cache: 'no-store' }]]);
  });

  it('records a failure instead of throwing', async () => {
    const config = new Config();
    await config.load(async () => new Response('', { status: 404 }));
    expect(config.value()).toBeNull();
    expect(config.error()).toBe('GET /config.json answered 404');
  });
});
