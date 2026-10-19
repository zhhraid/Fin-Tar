import "@testing-library/jest-dom/vitest";

// The UI follows the browser language; the flow tests are written against the Indonesian UI.
window.localStorage.setItem("fintar-lang", "id");

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "confirm", {
  writable: true,
  value: () => true,
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
