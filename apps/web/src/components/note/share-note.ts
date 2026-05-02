import { getDesktopBridge } from "@workspace/platform/desktop";

export type NoteVisibility = "private" | "public";

export async function writeTextToClipboard(value: string) {
	const desktopBridge = getDesktopBridge();

	if (desktopBridge) {
		await desktopBridge.writeClipboardText(value);
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

const copyRichTextWithSelectionFallback = async ({
	html,
	text,
}: {
	html: string;
	text: string;
}) => {
	const container = document.createElement("div");
	container.setAttribute("contenteditable", "true");
	container.setAttribute("aria-hidden", "true");
	container.style.position = "fixed";
	container.style.pointerEvents = "none";
	container.style.opacity = "0";
	container.style.whiteSpace = "pre-wrap";
	container.style.inset = "0";
	container.innerHTML = html;
	document.body.appendChild(container);

	const selection = window.getSelection();
	const previousRanges =
		selection && selection.rangeCount > 0
			? Array.from({ length: selection.rangeCount }, (_, index) =>
					selection.getRangeAt(index).cloneRange(),
				)
			: [];

	const range = document.createRange();
	range.selectNodeContents(container);
	selection?.removeAllRanges();
	selection?.addRange(range);

	try {
		const succeeded = document.execCommand("copy");
		if (!succeeded) {
			throw new Error("execCommand copy returned false");
		}
	} catch (error) {
		document.body.removeChild(container);
		selection?.removeAllRanges();
		for (const previousRange of previousRanges) {
			selection?.addRange(previousRange);
		}
		void error;
		await writeTextToClipboard(text);
		return;
	}

	document.body.removeChild(container);
	selection?.removeAllRanges();
	for (const previousRange of previousRanges) {
		selection?.addRange(previousRange);
	}
};

export async function writeRichTextToClipboard({
	html,
	text,
}: {
	html: string;
	text: string;
}) {
	const desktopBridge = getDesktopBridge();

	if (desktopBridge?.writeClipboardRichText) {
		await desktopBridge.writeClipboardRichText({
			html,
			text,
		});
		return;
	}

	if (
		typeof ClipboardItem !== "undefined" &&
		navigator.clipboard?.write &&
		window.isSecureContext
	) {
		try {
			await navigator.clipboard.write([
				new ClipboardItem({
					"text/html": new Blob([html], { type: "text/html" }),
					"text/plain": new Blob([text], { type: "text/plain" }),
				}),
			]);
			return;
		} catch {
			// Fall through to selection/plain-text fallback when rich clipboard writes
			// are exposed but blocked by the browser.
		}
	}

	await copyRichTextWithSelectionFallback({
		html,
		text,
	});
}

async function getShareBaseUrl() {
	const desktopBridge = getDesktopBridge();

	if (desktopBridge?.getShareBaseUrl) {
		return (await desktopBridge.getShareBaseUrl()).url;
	}

	return window.location.origin;
}

export async function buildNoteShareUrl(shareId: string) {
	const baseUrl = new URL(await getShareBaseUrl());

	baseUrl.pathname = `/shared/${shareId}`;
	baseUrl.search = "";
	baseUrl.hash = "";

	return baseUrl.toString();
}
