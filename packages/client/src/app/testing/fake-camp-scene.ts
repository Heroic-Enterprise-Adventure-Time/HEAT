/** A camp scene that draws nothing and records nothing: no WebGL in a test. */
export const fakeCampScene = () => Promise.resolve({ setHeroes: () => undefined, setLevels: () => undefined, destroy: () => undefined });
