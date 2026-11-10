import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ApolloClient, InMemoryCache } from '@apollo/client';

import { Config, type StackConfig } from './config';
import { MeDocument } from './graphql/generated/graphql';
import { ApiError, apiError, Hub, PREVIOUS, Refusal, refusalWords, VERSION_HEADER } from './hub';
import { Session } from './session';

const config: StackConfig = {
  graphqlPath: '/graphql',
  userPoolId: 'us-east-1_EXAMPLE',
  clientId: '1example23456789',
  loginHost: 'https://auth.heat-sb.dcg-games.com',
  passwordSignIn: true,
  version: '433e740c1d2b3a4f5e6d7c8b9a0f1e2d3c4b5a69',
};

/** A client on the hub's link chain, over Angular's testing HTTP backend, so each request is read and answered here. */
function setup() {
  TestBed.configureTestingModule({
    providers: [
      provideHttpClient(),
      provideHttpClientTesting(),
      { provide: Config, useValue: { value: signal(config) } },
      { provide: Session, useValue: { user: signal({ email: null, name: null, accessToken: 'access' }) } },
    ],
  });
  const hub = TestBed.inject(Hub);
  const client = new ApolloClient({ link: hub.link(), cache: new InMemoryCache() });
  return { hub, client, http: TestBed.inject(HttpTestingController) };
}

/** Runs the query and answers its one request with the body, as the hub would. */
async function answer<T>(work: Promise<T>, http: HttpTestingController, path: string, body: object) {
  await vi.waitFor(() => { http.expectOne(path).flush(body); });
  return work;
}

describe('Hub', () => {
  it("sends the client's version from config.json on every request, with the token, to the stack's GraphQL path", async () => {
    const { hub, client, http } = setup();
    const work = client.query({ query: MeDocument, fetchPolicy: 'network-only' });
    await vi.waitFor(() => {
      const request = http.expectOne('/graphql');
      expect(request.request.headers.get('authorization')).toBe('Bearer access');
      expect(request.request.headers.get(VERSION_HEADER)).toBe(config.version);
      request.flush({ data: { me: null } });
    });
    expect((await work).data).toEqual({ me: null });
    expect(VERSION_HEADER).toBe('heat-version');
    expect(hub.outdated()).toBe(false);
  });

  it('records a response flagged outdated', async () => {
    const { hub, client, http } = setup();
    await answer(client.query({ query: MeDocument, fetchPolicy: 'network-only' }), http, '/graphql', { data: { me: null }, extensions: { outdated: true } });
    expect(hub.outdated()).toBe(true);
  });

  it('records the flag on an error response too, and the error reaches the caller with its code', async () => {
    const { hub, client, http } = setup();
    const work = client.query({ query: MeDocument, fetchPolicy: 'network-only' });
    await vi.waitFor(() => {
      http.expectOne('/graphql').flush({ errors: [{ message: 'a party is 1 to 4 heroes', extensions: { code: 'BAD_USER_INPUT' } }], extensions: { outdated: true } });
    });
    const failed = await work.then(
      () => null,
      (e: unknown) => apiError(e),
    );
    expect(failed).toEqual(new ApiError('a party is 1 to 4 heroes', 'BAD_USER_INPUT'));
    expect(hub.outdated()).toBe(true);
  });

  it("sends a request routed to the previous deploy to /previous in front of the stack's path", async () => {
    const { client, http } = setup();
    await answer(client.query({ query: MeDocument, fetchPolicy: 'network-only', context: { route: PREVIOUS } }), http, '/previous/graphql', { data: { me: null } });
    http.verify();
  });

  it('turns a status the hub answered into an ApiError without a code', async () => {
    const { client, http } = setup();
    const work = client.query({ query: MeDocument, fetchPolicy: 'network-only' });
    await vi.waitFor(() => {
      http.expectOne('/graphql').flush('', { status: 502, statusText: 'Bad Gateway' });
    });
    const failed = await work.then(
      () => null,
      (e: unknown) => apiError(e),
    );
    expect(failed).toEqual(new ApiError('the hub answered 502', null));
  });
});

describe('refusalWords', () => {
  const words: Readonly<Record<'HallFull' | 'Conflict', string>> = { HallFull: 'The hall is full.', Conflict: 'Try again.' };

  it("answers a refusal the table knows in the player's words", () => {
    expect(refusalWords(new Refusal('HallFull', 'the hall holds 4'), words)).toBe('The hall is full.');
  });

  it('answers a refusal the table lacks, or a failure that is no refusal, as it was put', () => {
    expect(refusalWords(new Refusal('SomethingNew', 'something new'), words)).toBe('something new');
    expect(refusalWords(new Refusal('toString', 'not a key of the table'), words)).toBe('not a key of the table');
    expect(refusalWords(new ApiError('the hub answered 502', null), words)).toBe('the hub answered 502');
  });
});
