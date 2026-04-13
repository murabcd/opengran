class ResizeObserverMock {
	observe() {}

	unobserve() {}

	disconnect() {}
}

globalThis.ResizeObserver = ResizeObserverMock;

const createMediaQueryList = (query: string): MediaQueryList =>
	({
		matches: false,
		media: query,
		onchange: null,
		addEventListener: () => {},
		removeEventListener: () => {},
		addListener: () => {},
		removeListener: () => {},
		dispatchEvent: () => false,
	}) as MediaQueryList;

Object.defineProperty(window, "matchMedia", {
	writable: true,
	value: (query: string) => createMediaQueryList(query),
});
