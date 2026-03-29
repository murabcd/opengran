type YandexCalendarConnection = {
	email: string;
	password: string;
	serverAddress: string;
	calendarHomePath: string;
};

type YandexCalendarCollection = {
	id: string;
	displayName: string;
	href: string;
};

type YandexUpcomingCalendarEvent = {
	id: string;
	calendarId: string;
	calendarName: string;
	title: string;
	startAt: string;
	endAt: string;
	isAllDay: boolean;
	isMeeting: boolean;
	htmlLink?: string;
	meetingUrl?: string;
	location?: string;
};

type ParsedIcsProperty = {
	parameters: Record<string, string>;
	value: string;
};

type ParsedIcsEvent = Record<string, ParsedIcsProperty>;

const XML_CONTENT_TYPE = "application/xml; charset=utf-8";
const CALDAV_NAMESPACE = "urn:ietf:params:xml:ns:caldav";
const WEBDAV_NAMESPACE = "DAV:";
const URL_PATTERN = /https?:\/\/[^\s<>"]+/giu;

export const YANDEX_CALENDAR_SERVER_ADDRESS = "caldav.yandex.ru";

const encodeXmlText = (value: string) =>
	value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");

const decodeXmlText = (value: string) =>
	value
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&amp;", "&");

const escapeRegExp = (value: string) =>
	value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&");

const getXmlTagContent = (xml: string, tagName: string) => {
	const expression = new RegExp(
		`<(?:[\\w-]+:)?${escapeRegExp(tagName)}\\b[^>]*>([\\s\\S]*?)<\\/(?:[\\w-]+:)?${escapeRegExp(tagName)}>`,
		"iu",
	);

	return expression.exec(xml)?.[1] ?? null;
};

const getXmlHrefValue = (xml: string) =>
	decodeXmlText(getXmlTagContent(xml, "href") ?? "").trim();

const getXmlResponseBlocks = (xml: string) =>
	xml.match(/<(?:[\w-]+:)?response\b[\s\S]*?<\/(?:[\w-]+:)?response>/giu) ?? [];

const normalizeHrefPath = (href: string) => {
	try {
		return new URL(href).pathname;
	} catch {
		return href;
	}
};

const buildYandexCalendarUrl = (serverAddress: string, path: string) =>
	new URL(path, `https://${serverAddress}`);

const buildBasicAuthHeader = (email: string, password: string) =>
	`Basic ${Buffer.from(`${email}:${password}`, "utf8").toString("base64")}`;

const fetchYandexDav = async ({
	body,
	connection,
	depth,
	method,
	path,
}: {
	body?: string;
	connection: YandexCalendarConnection;
	depth?: "0" | "1";
	method: "PROPFIND" | "REPORT";
	path: string;
}) => {
	return await fetch(
		buildYandexCalendarUrl(connection.serverAddress, path),
		{
			method,
			headers: {
				Authorization: buildBasicAuthHeader(
					connection.email,
					connection.password,
				),
				Depth: depth ?? "0",
				"Content-Type": XML_CONTENT_TYPE,
			},
			body,
		},
	);
};

const requireSuccessfulDavResponse = async (
	response: Response,
	errorContext: string,
) => {
	if (response.ok || response.status === 207) {
		return await response.text();
	}

	const responseText = await response.text().catch(() => "");
	const suffix = responseText.trim() ? ` ${responseText.trim()}` : "";
	throw new Error(`${errorContext} (${response.status}).${suffix}`.trim());
};

export const normalizeYandexCalendarEmail = (value: string) =>
	value.trim().toLowerCase();

export const getYandexCalendarPrincipalPath = (email: string) =>
	`/principals/users/${normalizeYandexCalendarEmail(email)}/`;

export const getYandexCalendarHomePath = (email: string) =>
	`/calendars/${normalizeYandexCalendarEmail(email)}/`;

const resolveCalendarHomePathFromPrincipal = async ({
	email,
	password,
	serverAddress,
}: {
	email: string;
	password: string;
	serverAddress: string;
}) => {
	const principalPath = getYandexCalendarPrincipalPath(email);
	const response = await fetchYandexDav({
		connection: {
			email,
			password,
			serverAddress,
			calendarHomePath: principalPath,
		},
		method: "PROPFIND",
		path: principalPath,
		body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="${WEBDAV_NAMESPACE}" xmlns:c="${CALDAV_NAMESPACE}">
	<d:prop>
		<c:calendar-home-set />
	</d:prop>
</d:propfind>`,
	});
	const xml = await requireSuccessfulDavResponse(
		response,
		"Failed to connect Yandex Calendar",
	);
	const calendarHomeSetXml = getXmlTagContent(xml, "calendar-home-set") ?? "";
	const calendarHomeHref = getXmlHrefValue(calendarHomeSetXml);

	if (calendarHomeHref) {
		return normalizeHrefPath(calendarHomeHref);
	}

	return getYandexCalendarHomePath(email);
};

export const verifyYandexCalendarConnection = async ({
	email,
	password,
	serverAddress = YANDEX_CALENDAR_SERVER_ADDRESS,
}: {
	email: string;
	password: string;
	serverAddress?: string;
}) => {
	const normalizedEmail = normalizeYandexCalendarEmail(email);
	const calendarHomePath = await resolveCalendarHomePathFromPrincipal({
		email: normalizedEmail,
		password,
		serverAddress,
	});

	return {
		email: normalizedEmail,
		serverAddress,
		calendarHomePath,
	};
};

const parseYandexCalendarCollections = (
	xml: string,
	connection: YandexCalendarConnection,
) => {
	const normalizedHomePath = normalizeHrefPath(connection.calendarHomePath);

	return getXmlResponseBlocks(xml)
		.map((block) => {
			const href = decodeXmlText(getXmlTagContent(block, "href") ?? "").trim();
			const responsePath = normalizeHrefPath(href);
			const resourceType = getXmlTagContent(block, "resourcetype") ?? "";

			if (
				!href ||
				responsePath === normalizedHomePath ||
				!/<(?:[\w-]+:)?calendar\b/iu.test(resourceType)
			) {
				return null;
			}

			return {
				id: `yandex:${responsePath}`,
				displayName:
					decodeXmlText(getXmlTagContent(block, "displayname") ?? "").trim() ||
					"Yandex Calendar",
				href: responsePath,
			} satisfies YandexCalendarCollection;
		})
		.filter((calendar): calendar is YandexCalendarCollection => calendar !== null);
};

const formatCalDavTimestamp = (value: number) => {
	const date = new Date(value);
	const parts = [
		date.getUTCFullYear().toString().padStart(4, "0"),
		(date.getUTCMonth() + 1).toString().padStart(2, "0"),
		date.getUTCDate().toString().padStart(2, "0"),
		"T",
		date.getUTCHours().toString().padStart(2, "0"),
		date.getUTCMinutes().toString().padStart(2, "0"),
		date.getUTCSeconds().toString().padStart(2, "0"),
		"Z",
	];

	return parts.join("");
};

const unfoldIcsLines = (value: string) =>
	value
		.replaceAll("\r\n", "\n")
		.replaceAll("\r", "\n")
		.replaceAll(/\n[ \t]/gu, "");

const decodeIcsText = (value: string) =>
	value
		.replaceAll("\\n", "\n")
		.replaceAll("\\N", "\n")
		.replaceAll("\\,", ",")
		.replaceAll("\\;", ";")
		.replaceAll("\\\\", "\\");

const tryParseUrl = (value: string) => {
	try {
		return new URL(value);
	} catch {
		return null;
	}
};

const extractUrls = (value?: string) =>
	value ? Array.from(value.matchAll(URL_PATTERN), (match) => match[0]) : [];

const isGenericYandexEventUrl = (value: string) => {
	const parsedUrl = tryParseUrl(value);

	if (!parsedUrl) {
		return false;
	}

	return (
		(parsedUrl.hostname === "calendar.yandex.com" ||
			parsedUrl.hostname === "calendar.yandex.ru" ||
			parsedUrl.hostname === "calendar.360.yandex.ru") &&
		parsedUrl.pathname.startsWith("/event")
	);
};

const isMeetingJoinUrl = (value: string) => {
	const parsedUrl = tryParseUrl(value);

	if (!parsedUrl || isGenericYandexEventUrl(value)) {
		return false;
	}

	const hostname = parsedUrl.hostname.toLowerCase();

	return (
		hostname === "telemost.yandex.ru" ||
		hostname === "telemost.360.yandex.ru" ||
		hostname === "meet.google.com" ||
		hostname === "teams.microsoft.com" ||
		hostname === "meetings.office.com" ||
		hostname === "zoom.us" ||
		hostname.endsWith(".zoom.us") ||
		hostname.endsWith(".webex.com")
	);
};

const parseIcsPropertyLine = (line: string) => {
	const separatorIndex = line.indexOf(":");

	if (separatorIndex < 0) {
		return null;
	}

	const rawKey = line.slice(0, separatorIndex);
	const rawValue = line.slice(separatorIndex + 1);
	const [name, ...parameterEntries] = rawKey.split(";");
	const parameters: Record<string, string> = {};

	for (const entry of parameterEntries) {
		const [parameterName, ...parameterValueParts] = entry.split("=");

		if (!parameterName || parameterValueParts.length === 0) {
			continue;
		}

		parameters[parameterName.toUpperCase()] = parameterValueParts.join("=");
	}

	return {
		name: name.toUpperCase(),
		parameters,
		value: rawValue,
	};
};

const parseIcsEvents = (calendarData: string) => {
	const lines = unfoldIcsLines(calendarData).split("\n");
	const events: ParsedIcsEvent[] = [];
	let currentEvent:
		| ParsedIcsEvent
		| null = null;

	for (const rawLine of lines) {
		const line = rawLine.trimEnd();

		if (line === "BEGIN:VEVENT") {
			currentEvent = {};
			continue;
		}

		if (line === "END:VEVENT") {
			if (currentEvent) {
				events.push(currentEvent);
			}
			currentEvent = null;
			continue;
		}

		if (!currentEvent) {
			continue;
		}

		const property = parseIcsPropertyLine(line);

		if (!property || property.name in currentEvent) {
			continue;
		}

		currentEvent[property.name] = {
			parameters: property.parameters,
			value: property.value,
		};
	}

	return events;
};

const addDaysToDateParts = (
	parts: NonNullable<ReturnType<typeof parseIcsDateParts>>,
	days: number,
) => {
	const shiftedDate = new Date(
		Date.UTC(parts.year, parts.month - 1, parts.day + days),
	);

	return {
		year: shiftedDate.getUTCFullYear(),
		month: shiftedDate.getUTCMonth() + 1,
		day: shiftedDate.getUTCDate(),
		hour: parts.hour,
		minute: parts.minute,
		second: parts.second,
		isUtc: parts.isUtc,
	};
};

const getDatePartWeekday = (
	parts: NonNullable<ReturnType<typeof parseIcsDateParts>>,
) => new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();

const parseRrule = (value: string) =>
	Object.fromEntries(
		value
			.split(";")
			.map((entry) => entry.split("="))
			.filter((entry) => entry.length === 2)
			.map(([key, parsedValue]) => [key.toUpperCase(), parsedValue]),
	);

const ICS_WEEKDAY_INDEX_BY_CODE: Record<string, number> = {
	SU: 0,
	MO: 1,
	TU: 2,
	WE: 3,
	TH: 4,
	FR: 5,
	SA: 6,
};

const parseIcsDateParts = (value: string) => {
	const match = value.match(
		/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2}))?(Z)?$/u,
	);

	if (!match) {
		return null;
	}

	return {
		year: Number(match[1]),
		month: Number(match[2]),
		day: Number(match[3]),
		hour: Number(match[4] ?? "0"),
		minute: Number(match[5] ?? "0"),
		second: Number(match[6] ?? "0"),
		isUtc: match[7] === "Z",
	};
};

const getTimeZoneOffsetMs = (date: Date, timeZone: string) => {
	const formatter = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	});
	const parts = formatter.formatToParts(date);
	const numericPart = (type: string) =>
		Number(parts.find((part) => part.type === type)?.value ?? "0");
	const asUtc = Date.UTC(
		numericPart("year"),
		numericPart("month") - 1,
		numericPart("day"),
		numericPart("hour"),
		numericPart("minute"),
		numericPart("second"),
	);

	return asUtc - date.getTime();
};

const zonedDateTimeToUtc = (
	parts: NonNullable<ReturnType<typeof parseIcsDateParts>>,
	timeZone: string,
) => {
	const utcGuess = Date.UTC(
		parts.year,
		parts.month - 1,
		parts.day,
		parts.hour,
		parts.minute,
		parts.second,
	);
	const initialOffset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
	let timestamp = utcGuess - initialOffset;
	const adjustedOffset = getTimeZoneOffsetMs(new Date(timestamp), timeZone);

	if (adjustedOffset !== initialOffset) {
		timestamp = utcGuess - adjustedOffset;
	}

	return new Date(timestamp);
};

const parseIcsDateValue = (
	value: string,
	parameters: Record<string, string>,
	isEnd: boolean,
) => {
	const isAllDay = parameters.VALUE === "DATE" || /^\d{8}$/u.test(value);

	if (isAllDay) {
		const parts = parseIcsDateParts(value);

		if (!parts) {
			return null;
		}

		const timestamp = new Date(
			Date.UTC(parts.year, parts.month - 1, parts.day),
		).getTime();

		return new Date(isEnd ? timestamp - 1 : timestamp);
	}

	const parts = parseIcsDateParts(value);

	if (!parts) {
		return null;
	}

	if (parts.isUtc) {
		return new Date(
			Date.UTC(
				parts.year,
				parts.month - 1,
				parts.day,
				parts.hour,
				parts.minute,
				parts.second,
			),
		);
	}

	const timeZone = parameters.TZID;

	if (timeZone) {
		try {
			return zonedDateTimeToUtc(parts, timeZone);
		} catch {
			// Fall through to the floating-time parse below.
		}
	}

	return new Date(
		Date.UTC(
			parts.year,
			parts.month - 1,
			parts.day,
			parts.hour,
			parts.minute,
			parts.second,
		),
	);
};

const getMeetingUrl = ({
	conference,
	description,
	location,
	telemostConference,
}: {
	conference?: string;
	description?: string;
	location?: string;
	telemostConference?: string;
}) => {
	for (const candidate of [
		conference?.trim(),
		telemostConference?.trim(),
		...extractUrls(description),
		...extractUrls(location),
	]) {
		if (candidate && isMeetingJoinUrl(candidate)) {
			return candidate;
		}
	}
};

const normalizeYandexCalendarEvent = ({
	calendar,
	event,
	href,
	now,
	overrideEndAt,
	overrideStartAt,
	overrideTitle,
}: {
	calendar: YandexCalendarCollection;
	event: ParsedIcsEvent;
	href: string;
	now: number;
	overrideEndAt?: Date;
	overrideStartAt?: Date;
	overrideTitle?: string;
}): YandexUpcomingCalendarEvent | null => {
	if (event.STATUS?.value?.toUpperCase() === "CANCELLED") {
		return null;
	}

	const startProperty = event.DTSTART;

	if (!startProperty) {
		return null;
	}

	const endProperty = event.DTEND ?? event.DUE ?? startProperty;
	const startAt =
		overrideStartAt ??
		parseIcsDateValue(startProperty.value, startProperty.parameters, false);
	const endAt =
		overrideEndAt ??
		parseIcsDateValue(endProperty.value, endProperty.parameters, true) ??
		startAt;

	if (!startAt || !endAt || endAt.getTime() < now) {
		return null;
	}

	const description = event.DESCRIPTION
		? decodeIcsText(event.DESCRIPTION.value).trim()
		: undefined;
	const location = event.LOCATION
		? decodeIcsText(event.LOCATION.value).trim()
		: undefined;
	const url = event.URL ? decodeIcsText(event.URL.value).trim() : undefined;
	const meetingUrl = getMeetingUrl({
		conference: event.CONFERENCE
			? decodeIcsText(event.CONFERENCE.value).trim()
			: undefined,
		description,
		location,
		telemostConference: event["X-TELEMOST-CONFERENCE"]
			? decodeIcsText(event["X-TELEMOST-CONFERENCE"].value).trim()
			: undefined,
	});

	return {
		id: `yandex:${event.UID?.value ?? href}:${startAt.toISOString()}`,
		calendarId: calendar.id,
		calendarName: calendar.displayName,
		title:
			overrideTitle ??
			(event.SUMMARY ? decodeIcsText(event.SUMMARY.value).trim() : "Untitled event"),
		startAt: startAt.toISOString(),
		endAt: endAt.toISOString(),
		isAllDay:
			startProperty.parameters.VALUE === "DATE" ||
			/^\d{8}$/u.test(startProperty.value),
		isMeeting: Boolean(meetingUrl || event.ATTENDEE),
		htmlLink: url,
		meetingUrl,
		location: location || undefined,
	};
};

const getRecurringOccurrenceStart = ({
	candidateDate,
	startProperty,
}: {
	candidateDate: NonNullable<ReturnType<typeof parseIcsDateParts>>;
	startProperty: ParsedIcsProperty;
}) => {
	if (startProperty.parameters.VALUE === "DATE" || /^\d{8}$/u.test(startProperty.value)) {
		return new Date(
			Date.UTC(candidateDate.year, candidateDate.month - 1, candidateDate.day),
		);
	}

	if (candidateDate.isUtc) {
		return new Date(
			Date.UTC(
				candidateDate.year,
				candidateDate.month - 1,
				candidateDate.day,
				candidateDate.hour,
				candidateDate.minute,
				candidateDate.second,
			),
		);
	}

	const timeZone = startProperty.parameters.TZID;

	if (timeZone) {
		return zonedDateTimeToUtc(candidateDate, timeZone);
	}

	return new Date(
		Date.UTC(
			candidateDate.year,
			candidateDate.month - 1,
			candidateDate.day,
			candidateDate.hour,
			candidateDate.minute,
			candidateDate.second,
		),
	);
};

const expandRecurringYandexCalendarEvent = ({
	calendar,
	event,
	href,
	now,
	overrideByRecurrenceId,
	timeMax,
	timeMin,
}: {
	calendar: YandexCalendarCollection;
	event: ParsedIcsEvent;
	href: string;
	now: number;
	overrideByRecurrenceId: Map<string, ParsedIcsEvent>;
	timeMax: number;
	timeMin: number;
}) => {
	const startProperty = event.DTSTART;

	if (!startProperty || !event.RRULE) {
		return [];
	}

	const endProperty = event.DTEND ?? event.DUE ?? startProperty;
	const seriesStart = parseIcsDateValue(
		startProperty.value,
		startProperty.parameters,
		false,
	);
	const seriesEnd =
		parseIcsDateValue(endProperty.value, endProperty.parameters, true) ?? seriesStart;
	const startParts = parseIcsDateParts(startProperty.value);
	const rule = parseRrule(event.RRULE.value);

	if (!seriesStart || !seriesEnd || !startParts) {
		return [];
	}

	const durationMs = Math.max(0, seriesEnd.getTime() - seriesStart.getTime());
	const interval = Math.max(1, Number(rule.INTERVAL ?? "1"));
	const until = rule.UNTIL
		? parseIcsDateValue(rule.UNTIL, {}, false)?.getTime() ?? null
		: null;
	const count = rule.COUNT ? Number(rule.COUNT) : null;
	const occurrences: YandexUpcomingCalendarEvent[] = [];

	if (rule.FREQ === "DAILY") {
		let occurrenceIndex = 0;
		let currentParts = startParts;

		while (true) {
			const occurrenceStart = getRecurringOccurrenceStart({
				candidateDate: currentParts,
				startProperty,
			});
			const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);

			if (occurrenceStart.getTime() > timeMax) {
				break;
			}

			if (until !== null && occurrenceStart.getTime() > until) {
				break;
			}

			if (count !== null && occurrenceIndex >= count) {
				break;
			}

			if (occurrenceEnd.getTime() >= timeMin) {
				const recurrenceId = occurrenceStart.toISOString();
				const overrideEvent = overrideByRecurrenceId.get(recurrenceId);
				const normalizedEvent = normalizeYandexCalendarEvent({
					calendar,
					event: overrideEvent ?? event,
					href,
					now,
					overrideStartAt: overrideEvent ? undefined : occurrenceStart,
					overrideEndAt: overrideEvent
						? undefined
						: new Date(occurrenceStart.getTime() + durationMs),
				});

				if (normalizedEvent) {
					occurrences.push(normalizedEvent);
				}
			}

			currentParts = addDaysToDateParts(currentParts, interval);
			occurrenceIndex += 1;
		}

		return occurrences;
	}

	if (rule.FREQ === "WEEKLY") {
		const byDayCodes = (rule.BYDAY ?? "")
			.split(",")
			.map((value) => value.trim().toUpperCase())
			.filter(Boolean);
		const byDays =
			byDayCodes.length > 0
				? byDayCodes
						.map((code) => ICS_WEEKDAY_INDEX_BY_CODE[code])
						.filter((value) => value !== undefined)
				: [getDatePartWeekday(startParts)];
		let daysFromSeriesStart = 0;
		let generatedCount = 0;

		while (true) {
			const candidateDate = addDaysToDateParts(startParts, daysFromSeriesStart);
			const occurrenceStart = getRecurringOccurrenceStart({
				candidateDate,
				startProperty,
			});
			const occurrenceEnd = new Date(occurrenceStart.getTime() + durationMs);

			if (occurrenceStart.getTime() > timeMax) {
				break;
			}

			const weekOffset = Math.floor(daysFromSeriesStart / 7);
			const candidateWeekday = getDatePartWeekday(candidateDate);
			const matchesWeeklyRule =
				weekOffset % interval === 0 && byDays.includes(candidateWeekday);

			if (
				matchesWeeklyRule &&
				(until === null || occurrenceStart.getTime() <= until) &&
				(count === null || generatedCount < count) &&
				occurrenceEnd.getTime() >= timeMin
			) {
				const recurrenceId = occurrenceStart.toISOString();
				const overrideEvent = overrideByRecurrenceId.get(recurrenceId);
				const normalizedEvent = normalizeYandexCalendarEvent({
					calendar,
					event: overrideEvent ?? event,
					href,
					now,
					overrideStartAt: overrideEvent ? undefined : occurrenceStart,
					overrideEndAt: overrideEvent
						? undefined
						: new Date(occurrenceStart.getTime() + durationMs),
				});

				if (normalizedEvent) {
					occurrences.push(normalizedEvent);
				}

				generatedCount += 1;
			}

			daysFromSeriesStart += 1;
		}

		return occurrences;
	}

	return [];
};

const parseYandexCalendarReport = ({
	calendar,
	now,
	timeMax,
	timeMin,
	xml,
}: {
	calendar: YandexCalendarCollection;
	now: number;
	timeMax: number;
	timeMin: number;
	xml: string;
}) =>
	getXmlResponseBlocks(xml).flatMap((block) => {
		const href = decodeXmlText(getXmlTagContent(block, "href") ?? "").trim();
		const calendarData = decodeXmlText(
			getXmlTagContent(block, "calendar-data") ?? "",
		).trim();

		if (!href || !calendarData) {
			return [];
		}

		const parsedEvents = parseIcsEvents(calendarData);
		const overridesByUid = new Map<string, Map<string, ParsedIcsEvent>>();

		for (const event of parsedEvents) {
			if (!event["RECURRENCE-ID"] || !event.UID) {
				continue;
			}

			const recurrenceId = parseIcsDateValue(
				event["RECURRENCE-ID"].value,
				event["RECURRENCE-ID"].parameters,
				false,
			)?.toISOString();

			if (!recurrenceId) {
				continue;
			}

			const uid = event.UID.value;
			const overrides = overridesByUid.get(uid) ?? new Map<string, ParsedIcsEvent>();
			overrides.set(recurrenceId, event);
			overridesByUid.set(uid, overrides);
		}

		return parsedEvents.flatMap((event) => {
			if (event["RECURRENCE-ID"]) {
				return [];
			}

			if (event.RRULE) {
				return expandRecurringYandexCalendarEvent({
					calendar,
					event,
					href,
					now,
					timeMin,
					timeMax,
					overrideByRecurrenceId: overridesByUid.get(event.UID?.value ?? "") ?? new Map(),
				});
			}

			const normalizedEvent = normalizeYandexCalendarEvent({
				calendar,
				event,
				href,
				now,
			});

			return normalizedEvent ? [normalizedEvent] : [];
		});
	});

export const listYandexUpcomingEvents = async ({
	connection,
	now,
	timeMax,
	timeMin,
}: {
	connection: YandexCalendarConnection;
	now: number;
	timeMax: number;
	timeMin: number;
}) => {
	const calendarsResponse = await fetchYandexDav({
		connection,
		method: "PROPFIND",
		path: connection.calendarHomePath,
		depth: "1",
		body: `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="${WEBDAV_NAMESPACE}">
	<d:prop>
		<d:displayname />
		<d:resourcetype />
	</d:prop>
</d:propfind>`,
	});
	const calendarsXml = await requireSuccessfulDavResponse(
		calendarsResponse,
		"Failed to load Yandex calendars",
	);
	const calendars = parseYandexCalendarCollections(calendarsXml, connection);

	if (calendars.length === 0) {
		return {
			connectedCalendarCount: 0,
			events: [] as YandexUpcomingCalendarEvent[],
		};
	}

	const reportBody = `<?xml version="1.0" encoding="utf-8"?>
<c:calendar-query xmlns:d="${WEBDAV_NAMESPACE}" xmlns:c="${CALDAV_NAMESPACE}">
	<d:prop>
		<d:getetag />
		<c:calendar-data>
			<c:expand start="${encodeXmlText(formatCalDavTimestamp(timeMin))}" end="${encodeXmlText(formatCalDavTimestamp(timeMax))}" />
		</c:calendar-data>
	</d:prop>
	<c:filter>
		<c:comp-filter name="VCALENDAR">
			<c:comp-filter name="VEVENT">
				<c:time-range start="${encodeXmlText(formatCalDavTimestamp(timeMin))}" end="${encodeXmlText(formatCalDavTimestamp(timeMax))}" />
			</c:comp-filter>
		</c:comp-filter>
	</c:filter>
</c:calendar-query>`;

	const eventGroups = await Promise.all(
		calendars.map(async (calendar) => {
			try {
				const response = await fetchYandexDav({
					connection,
					method: "REPORT",
					path: calendar.href,
					depth: "1",
					body: reportBody,
				});
				const xml = await requireSuccessfulDavResponse(
					response,
					`Failed to load ${calendar.displayName}`,
				);
				const events = parseYandexCalendarReport({
					calendar,
					now,
					timeMax,
					timeMin,
					xml,
				});

				return events;
			} catch {
				return [];
			}
		}),
	);

	return {
		connectedCalendarCount: calendars.length,
		events: eventGroups.flat(),
	};
};
