import { Injectable, inject, signal } from '@angular/core';
import { Config } from './config';
import { Session } from './session';

/** A GraphQL error, with the hub's refusal code where it gave one (`HALL_FULL`, `INSUFFICIENT_RESOURCES`, ...). */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

interface GraphqlResponse<T> {
  data?: T | null;
  errors?: { message: string; extensions?: { code?: string } }[];
  extensions?: { outdated?: boolean };
}

/** The request header that carries the client's version; the hub's `VERSION_HEADER`. */
export const VERSION_HEADER = 'heat-version';

/**
 * Which deploy a request goes to: the current one at the stack's GraphQL
 * path, or the one before at `/previous` in front of it, which verifies the
 * adventures it issued (decision 0030).
 */
export type Route = 'current' | 'previous';
export const PREVIOUS: Route = 'previous';

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/**
 * The hub, the one API (decision 0004), at the stack's GraphQL path on this
 * origin, with the signed-in player's access token. The first error of a
 * response is thrown, since every operation the client makes is one field.
 * Every request carries the version the client loaded from `config.json`,
 * and a response flagged `outdated`, errors included, means a newer deploy
 * is live (decision 0030); what the client does about it is `Updates`'.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly config = inject(Config);
  private readonly session = inject(Session);
  fetchFn: Fetch = (input, init) => fetch(input, init);
  /** Whether the hub has said this client is not the deploy's. It stays set until the page reloads. */
  readonly outdated = signal(false);

  async request<T>(query: string, variables: Record<string, unknown> = {}, route: Route = 'current'): Promise<T> {
    const config = this.config.value();
    const user = this.session.user();
    if (!config || !user) throw new ApiError('not signed in', null);
    const response = await this.fetchFn(route === 'previous' ? `/previous${config.graphqlPath}` : config.graphqlPath, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${user.accessToken}`,
        [VERSION_HEADER]: config.version,
      },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new ApiError(`the hub answered ${response.status}`, null);
    const body = (await response.json()) as GraphqlResponse<T>;
    if (body.extensions?.outdated === true) this.outdated.set(true);
    const error = body.errors?.[0];
    if (error) throw new ApiError(error.message, error.extensions?.code ?? null);
    if (!body.data) throw new ApiError('the hub answered no data', null);
    return body.data;
  }
}
