import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useDesktopPanelPin } from "../src/components/layout/use-desktop-panel-pin";

describe("useDesktopPanelPin", () => {
	beforeEach(() => {
		window.localStorage.clear();
	});

	afterEach(() => {
		window.localStorage.clear();
	});

	it("rehydrates when the storage key changes", () => {
		window.localStorage.setItem("pin:note-1", "true");
		window.localStorage.setItem("pin:note-2", "false");

		const { result, rerender } = renderHook(
			({ storageKey }) =>
				useDesktopPanelPin({
					storageKey,
				}),
			{
				initialProps: {
					storageKey: "pin:note-1",
				},
			},
		);

		expect(result.current.isPinned).toBe(true);

		rerender({
			storageKey: "pin:note-2",
		});

		expect(result.current.isPinned).toBe(false);
	});

	it("persists toggles to the active storage key", () => {
		const { result } = renderHook(() =>
			useDesktopPanelPin({
				storageKey: "pin:note-3",
			}),
		);

		act(() => {
			result.current.togglePinned();
		});

		expect(result.current.isPinned).toBe(true);
		expect(window.localStorage.getItem("pin:note-3")).toBe("true");
	});
});
