import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getDesktopAuthCallbackUrl,
	getDesktopBridge,
	getDesktopMeetingDetectionState,
	isDesktopRuntime,
	onDesktopMeetingDetectionState,
	openDesktopExternalUrl,
	requestDesktopPermission,
	saveDesktopTextFile,
} from "@/lib/desktop-platform";

const originalDesktopBridge = window.openGranDesktop;

const setDesktopBridge = (
	bridge: Partial<NonNullable<Window["openGranDesktop"]>> | undefined,
) => {
	window.openGranDesktop = bridge as Window["openGranDesktop"];
};

afterEach(() => {
	window.openGranDesktop = originalDesktopBridge;
	vi.restoreAllMocks();
});

describe("desktop platform bridge", () => {
	it("reports desktop runtime availability from the bridge", () => {
		setDesktopBridge(undefined);

		expect(getDesktopBridge()).toBeNull();
		expect(isDesktopRuntime()).toBe(false);

		setDesktopBridge({
			platform: "darwin",
		});

		expect(getDesktopBridge()?.platform).toBe("darwin");
		expect(isDesktopRuntime()).toBe(true);
	});

	it("uses desktop auth callback URLs and falls back to the browser URL", async () => {
		setDesktopBridge(undefined);

		await expect(
			getDesktopAuthCallbackUrl("https://app.example/auth"),
		).resolves.toBe("https://app.example/auth");

		setDesktopBridge({
			getAuthCallbackUrl: vi.fn().mockResolvedValue({
				url: "opengran://auth/callback",
			}),
			platform: "darwin",
		});

		await expect(
			getDesktopAuthCallbackUrl("https://app.example/auth"),
		).resolves.toBe("opengran://auth/callback");
	});

	it("opens external URLs through desktop when available", async () => {
		const openExternalUrl = vi.fn().mockResolvedValue({ ok: true });
		setDesktopBridge({
			openExternalUrl,
			platform: "darwin",
		});

		await expect(openDesktopExternalUrl("https://example.com")).resolves.toBe(
			true,
		);
		expect(openExternalUrl).toHaveBeenCalledWith("https://example.com");
	});

	it("returns false for desktop actions when the capability is unavailable", async () => {
		setDesktopBridge({
			platform: "darwin",
		});

		await expect(openDesktopExternalUrl("https://example.com")).resolves.toBe(
			false,
		);
		await expect(requestDesktopPermission("microphone")).resolves.toBeNull();
		await expect(
			saveDesktopTextFile("note.txt", "content"),
		).resolves.toBeNull();
	});

	it("proxies meeting detection subscriptions and state", async () => {
		const unsubscribe = vi.fn();
		const onMeetingDetectionState = vi.fn().mockReturnValue(unsubscribe);
		const getMeetingDetectionState = vi.fn().mockResolvedValue({
			candidateStartedAt: null,
			confidence: 0,
			dismissedUntil: null,
			hasBrowserMeetingSignal: false,
			hasMeetingSignal: false,
			isMicrophoneActive: false,
			isSuppressed: false,
			sourceName: null,
			status: "idle",
		} satisfies DesktopMeetingDetectionState);
		const listener = vi.fn();

		setDesktopBridge({
			getMeetingDetectionState,
			onMeetingDetectionState,
			platform: "darwin",
		});

		expect(onDesktopMeetingDetectionState(listener)).toBe(unsubscribe);
		expect(onMeetingDetectionState).toHaveBeenCalledWith(listener);
		await expect(getDesktopMeetingDetectionState()).resolves.toMatchObject({
			status: "idle",
		});
	});
});
