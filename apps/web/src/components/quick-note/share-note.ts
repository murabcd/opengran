export type QuickNoteVisibility = "private" | "public";

export async function writeTextToClipboard(value: string) {
	if (window.openGranDesktop) {
		await window.openGranDesktop.writeClipboardText(value);
		return;
	}

	if (navigator.clipboard?.writeText) {
		await navigator.clipboard.writeText(value);
		return;
	}

	const textarea = document.createElement("textarea");
	textarea.value = value;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	document.body.appendChild(textarea);
	textarea.select();
	document.execCommand("copy");
	document.body.removeChild(textarea);
}

export async function getShareBaseUrl() {
	if (window.openGranDesktop?.getShareBaseUrl) {
		return (await window.openGranDesktop.getShareBaseUrl()).url;
	}

	return window.location.origin;
}

export async function buildQuickNoteShareUrl(shareId: string) {
	const baseUrl = new URL(await getShareBaseUrl());

	baseUrl.pathname = `/shared/${shareId}`;
	baseUrl.search = "";
	baseUrl.hash = "";

	return baseUrl.toString();
}
