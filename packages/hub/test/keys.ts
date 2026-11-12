/**
 * The keys as the tests look an item up past the repository (typescript.md,
 * rule 19). Spelled out here rather than read from TEMPLATES in src/db/keys.ts,
 * so that a template that drifts from the layout fails a test.
 */
export const playerKeys = {
  profile: (id: string) => ({ PK: `PLAYER#${id}`, SK: "PROFILE" }),
  camp: (id: string, location: string) => ({ PK: `PLAYER#${id}`, SK: `AT#${location}#CAMP` }),
  facility: (id: string, location: string, kind: string) => ({ PK: `PLAYER#${id}`, SK: `AT#${location}#FACILITY#${kind}` }),
  holding: (id: string, location: string, material: string) => ({ PK: `PLAYER#${id}`, SK: `AT#${location}#HOLDING#${material}` }),
  hero: (id: string, heroId: string) => ({ PK: `PLAYER#${id}`, SK: `HERO#${heroId}` }),
  open: (id: string) => ({ PK: `PLAYER#${id}`, SK: "OPEN" }),
  ledger: (id: string, causeId: string, entry: string) => ({ PK: `PLAYER#${id}`, SK: `LEDGER#${causeId}#${entry}` }),
};

export const locationKeys = {
  adventure: (adventureId: string) => ({ PK: `ADVENTURE#${adventureId}`, SK: "RECORD" }),
  seen: (location: string, heroId: string) => ({ PK: `LOCATION#${location}`, SK: `SEEN#${heroId}` }),
  done: (location: string, settledAt: string, adventureId: string) => ({ PK: `LOCATION#${location}`, SK: `DONE#${settledAt}#${adventureId}` }),
};

/** The keys a settled adventure's record carries for the location table's index, GSI1 (decision 0050). */
export const replayKeys = (jobId: string, settledAt: string) => ({ GSI1PK: `JOB#${jobId}`, GSI1SK: settledAt });
