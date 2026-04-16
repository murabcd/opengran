import { beforeEach, describe, expect, it, vi } from "vitest";

const convexTokenMock = vi.fn();

vi.mock("../src/lib/auth-client", () => ({
	authClient: {
		convex: {
			token: convexTokenMock,
		},
	},
}));

const createDeferred = <T>() => {
	let resolve!: (value: T) => void;
	let reject!: (reason?: unknown) => void;
	const promise = new Promise<T>((nextResolve, nextReject) => {
		resolve = nextResolve;
		reject = nextReject;
	});

	return { promise, resolve, reject };
};

const createToken = (expirationOffsetSeconds = 60 * 60) => {
	const encodedPayload = btoa(
		JSON.stringify({
			exp: Math.floor(Date.now() / 1000) + expirationOffsetSeconds,
		}),
	)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/g, "");

	return `header.${encodedPayload}.signature`;
};

describe("convex-token", () => {
	beforeEach(async () => {
		convexTokenMock.mockReset();
		const { clearCachedConvexToken } = await import("../src/lib/convex-token");
		clearCachedConvexToken();
	});

	it("does not repopulate the cache from a cleared in-flight request", async () => {
		const oldToken = createToken();
		const newToken = createToken(2 * 60 * 60);
		const deferredTokenRequest = createDeferred<{
			data?: { token?: string | null };
		}>();
		convexTokenMock
			.mockReturnValueOnce(deferredTokenRequest.promise)
			.mockResolvedValueOnce({
				data: { token: newToken },
			});

		const { clearCachedConvexToken, getCachedConvexToken } = await import(
			"../src/lib/convex-token"
		);

		const firstTokenRequest = getCachedConvexToken();
		clearCachedConvexToken();
		deferredTokenRequest.resolve({
			data: { token: oldToken },
		});

		await expect(firstTokenRequest).resolves.toBe(oldToken);
		await expect(getCachedConvexToken()).resolves.toBe(newToken);
		await expect(getCachedConvexToken()).resolves.toBe(newToken);

		expect(convexTokenMock).toHaveBeenCalledTimes(2);
	});

	it("rejects direct token reads when the token fetch fails", async () => {
		const error = new Error("token fetch failed");
		convexTokenMock.mockRejectedValueOnce(error);

		const { getCachedConvexToken } = await import("../src/lib/convex-token");

		await expect(getCachedConvexToken()).rejects.toThrow("token fetch failed");
	});

	it("swallows prefetch failures and retries on the next token read", async () => {
		convexTokenMock
			.mockRejectedValueOnce(new Error("prefetch failed"))
			.mockResolvedValueOnce({
				data: { token: "fresh-token" },
			});

		const { getCachedConvexToken, prefetchConvexToken } = await import(
			"../src/lib/convex-token"
		);

		await expect(prefetchConvexToken()).resolves.toBeUndefined();
		await expect(getCachedConvexToken()).resolves.toBe("fresh-token");

		expect(convexTokenMock).toHaveBeenCalledTimes(2);
	});
});
