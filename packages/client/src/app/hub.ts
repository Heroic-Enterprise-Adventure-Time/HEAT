import { inject, Service, signal } from '@angular/core';
import { ApolloLink, CombinedGraphQLErrors, ServerError } from '@apollo/client';
import { SetContextLink } from '@apollo/client/link/context';
import { HttpLink } from 'apollo-angular/http';
import { tap } from 'rxjs';
import * as z from 'zod/mini';

import { Config } from './config';
import { Session } from './session';

/**
 * An entry of a response's `errors` array, with its code where it has one:
 * what is not the game's business (docs/standards/graphql.md, rule 6); or the
 * hub not reached at all.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

/**
 * The game's refusal of a mutation, answered as data: a member of the
 * mutation's result union, named by its type (`HallFull`,
 * `InsufficientResources`, `AdventureOpen`, ...), with its message in the
 * player's words. `Game` throws one for the panel that asked to show.
 */
export class Refusal extends Error {
  constructor(
    readonly kind: string,
    message: string,
  ) {
    super(message);
  }
}

/** The refusal types a mutation's result union names: every member but its success. */
export type RefusalOf<Result extends { readonly __typename: string } | null> = Exclude<NonNullable<Result>, { readonly __typename: `${string}Success` }>['__typename'];

/**
 * A refusal in the player's words, from a component's table keyed by the
 * refusal types it shows; a type the table lacks, from a newer deploy, or a
 * failure that is no refusal, as the hub or the failure put it (angular.md,
 * rule 6).
 */
export function refusalWords<Kind extends string>(e: unknown, table: Readonly<Record<Kind, string>>): string {
  if (e instanceof Refusal && Object.hasOwn(table, e.kind)) return table[e.kind as Kind];
  return e instanceof Error ? e.message : String(e);
}

/**
 * What Apollo threw, as an `ApiError`: the first entry of the response's
 * `errors` array with its code, since every operation the client makes is
 * one field; a status the hub answered; or the failure as it was.
 */
export function apiError(e: unknown): ApiError {
  if (CombinedGraphQLErrors.is(e)) {
    const first = e.errors[0];
    const code = first?.extensions?.['code'];
    return new ApiError(first?.message ?? e.message, typeof code === 'string' ? code : null);
  }
  if (ServerError.is(e)) return new ApiError(`the hub answered ${e.statusCode}`, null);
  return new ApiError(e instanceof Error ? e.message : String(e), null);
}

/** The request header that carries the client's version; the hub's `VERSION_HEADER`. */
export const VERSION_HEADER = 'heat-version';

/** A refused request's body, as far as the chain reads it: the hub's flag that this client is not the deploy's. */
const FlaggedOutdated = z.object({ extensions: z.object({ outdated: z.literal(true) }) });

/** Whether the body of a response the hub refused carries the `outdated` flag; a body that is not the hub's JSON, a gateway's page, carries none. */
function flagsOutdated(bodyText: string): boolean {
  try {
    return FlaggedOutdated.safeParse(JSON.parse(bodyText)).success;
  } catch {
    return false;
  }
}

/**
 * Which deploy a request goes to: the current one at the stack's GraphQL
 * path, or the one before at `/previous` in front of it, which verifies the
 * adventures it issued (decision 0030). Named in an operation's context as
 * `route`, which the link turns into the request's path.
 */
export type Route = 'current' | 'previous';
export const PREVIOUS: Route = 'previous';

/**
 * The hub, the one API (decision 0012), as the page reaches it: the link
 * chain Apollo sends every operation through, and what the chain reads off
 * the answers. The chain sets the stack's GraphQL path on this origin, or
 * the previous deploy's, with the signed-in player's access token and the
 * version the client loaded from `config.json`; and a response flagged
 * `outdated`, errors included, means a newer deploy is live (decision 0030),
 * which `Updates` acts on. A refused request is read for the flag too: a
 * document that asks for a field a newer schema has dropped is refused at
 * validation with HTTP 400, and that refusal is how a tab loaded before the
 * deploy first hears of it (the review of PR-345, Issue-339).
 */
@Service()
export class Hub {
  private readonly config = inject(Config);
  private readonly session = inject(Session);
  private readonly http = inject(HttpLink);
  /** Whether the hub has said this client is not the deploy's. It stays set until the page reloads. */
  readonly outdated = signal(false);

  link(): ApolloLink {
    const request = new SetContextLink((context) => {
      const config = this.config.value();
      const user = this.session.user();
      if (!config || !user) throw new ApiError('not signed in', null);
      return {
        uri: context['route'] === PREVIOUS ? `/previous${config.graphqlPath}` : config.graphqlPath,
        headers: { authorization: `Bearer ${user.accessToken}`, [VERSION_HEADER]: config.version },
      };
    });
    const outdated = new ApolloLink((operation, forward) =>
      forward(operation).pipe(
        tap({
          next: (result) => {
            if (result.extensions?.['outdated'] === true) this.outdated.set(true);
          },
          // A request the hub refuses before running it is answered with HTTP 400, which reaches the chain as an error and not as a result.
          error: (e: unknown) => {
            if (ServerError.is(e) && flagsOutdated(e.bodyText)) this.outdated.set(true);
          },
        }),
      ),
    );
    return ApolloLink.from([request, outdated, this.http.create({})]);
  }
}
