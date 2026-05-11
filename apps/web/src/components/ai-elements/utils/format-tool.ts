export function getToolStatus(
	part: { output?: { success?: boolean }; state?: string },
	chatStatus?: string,
) {
	const basePending =
		part.state !== "output-available" && part.state !== "output-error";
	const isError =
		part.state === "output-error" ||
		(part.state === "output-available" && part.output?.success === false);
	const isSuccess = part.state === "output-available" && !isError;
	const isPending =
		basePending && (chatStatus === "streaming" || chatStatus === "submitted");
	const isInterrupted =
		basePending &&
		chatStatus !== "streaming" &&
		chatStatus !== "submitted" &&
		chatStatus !== undefined;

	return { isPending, isError, isSuccess, isInterrupted };
}
