import type { UIMessage } from "ai";

const chatTimeFormatter = new Intl.DateTimeFormat("en-US", {
	hour: "numeric",
	hour12: true,
	minute: "2-digit",
});

const chatDateFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	month: "short",
});

const isSameCalendarDay = (left: Date, right: Date) =>
	left.getFullYear() === right.getFullYear() &&
	left.getMonth() === right.getMonth() &&
	left.getDate() === right.getDate();

type TimestampedUIMessage = UIMessage & {
	createdAt?: Date | string | number;
};

export const getChatMessageTimestamp = (message: UIMessage) =>
	(message as TimestampedUIMessage).createdAt;

export const formatChatMessageTimestamp = (
	value: Date | string | number | undefined,
	now = new Date(),
) => {
	if (value === undefined) {
		return null;
	}

	const timestamp = new Date(value);

	if (Number.isNaN(timestamp.getTime())) {
		return null;
	}

	return isSameCalendarDay(timestamp, now)
		? chatTimeFormatter.format(timestamp)
		: chatDateFormatter.format(timestamp);
};
