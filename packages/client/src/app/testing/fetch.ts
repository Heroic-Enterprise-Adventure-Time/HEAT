/** A fetch that answers every request with the body, as JSON, and the status: what a spec hands to whatever reads a static file. */
export const answering = (body: unknown, status = 200): typeof fetch => () => Promise.resolve(new Response(JSON.stringify(body), { status }));
