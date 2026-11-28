// Testing Library's matchers, on every spec's expect.
import '@testing-library/jest-dom/vitest';

// What a test keeps in the browser's storage, a saved run, a job's last party, the version a page reloaded from, is gone
// before the next: a page that reads storage would otherwise open with what an earlier test kept (angular.md, rule 15).
afterEach(() => {
  localStorage.clear();
  sessionStorage.clear();
});
