import type { UIMessage } from "ai";

const timestampTimeFormatter = new Intl.DateTimeFormat("en-US", {
	hour: "numeric",
	hour12: true,
	minute: "2-digit",
});

const timestampDateFormatter = new Intl.DateTimeFormat("en-US", {
	day: "numeric",
	hour: "numeric",
	hour12: true,
	minute: "2-digit",
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

	return formatRelativeTimestamp(timestamp, now);
};

export const formatRelativeTimestamp = (
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
		? timestampTimeFormatter.format(timestamp)
		: timestampDateFormatter.format(timestamp);
};
