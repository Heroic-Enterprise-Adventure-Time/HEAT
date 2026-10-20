import { Injectable, inject } from '@angular/core';
import { Config } from './config';
import { Session } from './session';

/** A GraphQL error, with the hub's refusal code where it gave one (`NOT_FREE`, `HALL_FULL`, ...). */
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
}

export type Fetch = (input: string, init: RequestInit) => Promise<Response>;

/**
 * The hub, the one API (decision 0004), at the stack's GraphQL path on this
 * origin, with the signed-in player's access token. The first error of a
 * response is thrown, since every operation the client makes is one field.
 */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly config = inject(Config);
  private readonly session = inject(Session);
  fetchFn: Fetch = (input, init) => fetch(input, init);

  async request<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    const config = this.config.value();
    const user = this.session.user();
    if (!config || !user) throw new ApiError('not signed in', null);
    const response = await this.fetchFn(config.graphqlPath, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${user.accessToken}` },
      body: JSON.stringify({ query, variables }),
    });
    if (!response.ok) throw new ApiError(`the hub answered ${response.status}`, null);
    const body = (await response.json()) as GraphqlResponse<T>;
    const error = body.errors?.[0];
    if (error) throw new ApiError(error.message, error.extensions?.code ?? null);
    if (!body.data) throw new ApiError('the hub answered no data', null);
    return body.data;
  }
}
