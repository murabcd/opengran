export const parseCssLengthToPixels = (value: string | undefined) => {
	if (!value || typeof window === "undefined") {
		return 0;
	}

	const trimmedValue = value.trim();
	if (trimmedValue.length === 0) {
		return 0;
	}

	if (trimmedValue.endsWith("px")) {
		return Math.max(0, Number.parseFloat(trimmedValue) || 0);
	}

	if (trimmedValue.endsWith("rem")) {
		const rootFontSize = Number.parseFloat(
			window.getComputedStyle(document.documentElement).fontSize,
		);
		return Math.max(
			0,
			(Number.parseFloat(trimmedValue) || 0) *
				(Number.isFinite(rootFontSize) ? rootFontSize : 16),
		);
	}

	return Math.max(0, Number.parseFloat(trimmedValue) || 0);
};
