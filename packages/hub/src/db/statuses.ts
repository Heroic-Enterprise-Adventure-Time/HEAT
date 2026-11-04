/** The two sets the repository owns: the one list of each, which the stored items and the API's enums read (typescript.md, rule 18). */
export const HERO_STATUSES = ["ALIVE", "DEAD", "RETIRED"] as const;
export const ADVENTURE_STATUSES = ["OPEN", "SETTLED", "DISCARDED"] as const;
