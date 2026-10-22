import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Api, ApiError, VERSION_HEADER } from './api';
import { Config, type StackConfig } from './config';
import { Session } from './session';

const config: StackConfig = {
  graphqlPath: '/graphql',
  userPoolId: 'us-east-1_EXAMPLE',
  clientId: '1example23456789',
  loginHost: 'https://auth.heat-sb.dcg-games.com',
  passwordSignIn: true,
  version: '433e740c1d2b3a4f5e6d7c8b9a0f1e2d3c4b5a69',
};

/** An API whose hub answers with the body given, recording each request's headers. */
function setup(body: unknown) {
  TestBed.configureTestingModule({
    providers: [
      { provide: Config, useValue: { value: signal(config) } },
      { provide: Session, useValue: { user: signal({ email: null, name: null, accessToken: 'access' }) } },
    ],
  });
  const api = TestBed.inject(Api);
  const headers: Record<string, string>[] = [];
  api.fetchFn = async (_input, init) => {
    headers.push(init.headers as Record<string, string>);
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { api, headers };
}

describe('Api', () => {
  it("sends the client's version from config.json on every request, with the token", async () => {
    const { api, headers } = setup({ data: { me: null } });
    await api.request('{ me { id } }');
    expect(headers[0]).toMatchObject({ authorization: 'Bearer access', [VERSION_HEADER]: config.version });
    expect(VERSION_HEADER).toBe('heat-version');
    expect(api.outdated()).toBe(false);
  });

  it('records a response flagged outdated', async () => {
    const { api } = setup({ data: { me: null }, extensions: { outdated: true } });
    await api.request('{ me { id } }');
    expect(api.outdated()).toBe(true);
  });

  it('records the flag on an error response too, and still throws the refusal with its code', async () => {
    const { api } = setup({ errors: [{ message: 'a party is 1 to 4 heroes', extensions: { code: 'PARTY_SIZE' } }], extensions: { outdated: true } });
    await expect(api.request('mutation { x }')).rejects.toEqual(new ApiError('a party is 1 to 4 heroes', 'PARTY_SIZE'));
    expect(api.outdated()).toBe(true);
  });
});
