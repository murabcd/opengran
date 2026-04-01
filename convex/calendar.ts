"use node";

import { ConvexError, v } from "convex/values";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { ActionCtx } from "./_generated/server";
import { action } from "./_generated/server";
import { authComponent, createAuth } from "./auth";
import { listYandexUpcomingEvents } from "./yandexCalendar";

const UPCOMING_EVENTS_LIMIT = 12;

const upcomingCalendarEventValidator = v.object({
	id: v.string(),
	calendarId: v.string(),
	calendarName: v.string(),
	title: v.string(),
	startAt: v.string(),
	endAt: v.string(),
	isAllDay: v.boolean(),
	isMeeting: v.boolean(),
	htmlLink: v.optional(v.string()),
	meetingUrl: v.optional(v.string()),
	location: v.optional(v.string()),
});

const upcomingEventsResponseValidator = v.union(
	v.object({
		status: v.literal("not_connected"),
		events: v.array(upcomingCalendarEventValidator),
	}),
	v.object({
		status: v.literal("ready"),
		events: v.array(upcomingCalendarEventValidator),
		connectedCalendarCount: v.number(),
	}),
);

type GoogleCalendarListResponse = {
	items?: GoogleCalendarListEntry[];
};

type GoogleCalendarListEntry = {
	id: string;
	summary?: string;
	primary?: boolean;
	selected?: boolean;
	hidden?: boolean;
	accessRole?: string;
};

type GoogleCalendarEventsResponse = {
	items?: GoogleCalendarEvent[];
};

type GoogleCalendarEvent = {
	id: string;
	iCalUID?: string;
	summary?: string;
	status?: string;
	htmlLink?: string;
	hangoutLink?: string;
	location?: string;
	eventType?: string;
	start?: GoogleCalendarDateTime;
	end?: GoogleCalendarDateTime;
	attendees?: Array<{
		self?: boolean;
		responseStatus?: string;
	}>;
	conferenceData?: {
		entryPoints?: Array<{
			entryPointType?: string;
			uri?: string;
		}>;
	};
};

type GoogleCalendarDateTime = {
	date?: string;
	dateTime?: string;
};

type UpcomingCalendarEvent = {
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

type UpcomingEventsFetchResult = {
	connectedCalendarCount: number;
	events: UpcomingCalendarEvent[];
};

type CalendarVisibilityPreferences = {
	showGoogleCalendar: boolean;
	showYandexCalendar: boolean;
};

type UpcomingEventsResponse =
	| {
			status: "not_connected";
			events: UpcomingCalendarEvent[];
	  }
	| {
			status: "ready";
			events: UpcomingCalendarEvent[];
			connectedCalendarCount: number;
	  };

type RequestedCalendarWindow = {
	timeMin: number;
	timeMax: number;
};

const GOOGLE_CALENDAR_SCOPE =
	"https://www.googleapis.com/auth/calendar.readonly";

const getRequestedCalendarWindow = ({
	timeMax,
	timeMin,
}: {
	timeMax: string;
	timeMin: string;
}): RequestedCalendarWindow => {
	const parsedTimeMin = new Date(timeMin).getTime();
	const parsedTimeMax = new Date(timeMax).getTime();

	if (
		!Number.isFinite(parsedTimeMin) ||
		!Number.isFinite(parsedTimeMax) ||
		parsedTimeMax <= parsedTimeMin
	) {
		throw new ConvexError({
			code: "INVALID_CALENDAR_WINDOW",
			message: "Calendar window is invalid.",
		});
	}

	return {
		timeMin: parsedTimeMin,
		timeMax: parsedTimeMax,
	};
};

type BetterAuthInstance = ReturnType<typeof createAuth>;

type GoogleAuthContext = {
	auth: BetterAuthInstance;
	headers: Headers;
};

type GoogleAccessTokenResult = {
	accessToken: string;
	scopes: string[];
};

const parseGoogleScopeList = (scope: string | null | undefined) =>
	scope
		?.split(/[,\s]+/)
		.map((value) => value.trim())
		.filter(Boolean) ?? [];

const resolveGoogleScopes = (tokens: {
	scope?: string | null;
	scopes?: string[];
}) => {
	if (Array.isArray(tokens.scopes)) {
		return tokens.scopes.filter(Boolean);
	}

	return parseGoogleScopeList(tokens.scope);
};

const getGoogleAuthContext = async (ctx: ActionCtx): Promise<GoogleAuthContext> => {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		throw new ConvexError({
			code: "UNAUTHENTICATED",
			message: "You must be signed in to access calendar events.",
		});
	}

	return await authComponent.getAuth(createAuth, ctx);
};

const getGoogleAccessToken = async (
	authContext: GoogleAuthContext,
): Promise<GoogleAccessTokenResult | null> => {
	const { auth, headers } = authContext;

	try {
		const tokens = await auth.api.getAccessToken({
			body: { providerId: "google" },
			headers,
		});

		if (!tokens?.accessToken) {
			return null;
		}

		return {
			accessToken: tokens.accessToken,
			scopes: resolveGoogleScopes(tokens),
		};
	} catch {
		return null;
	}
};

const refreshGoogleAccessToken = async (
	authContext: GoogleAuthContext,
): Promise<GoogleAccessTokenResult | null> => {
	const { auth, headers } = authContext;

	try {
		const tokens = await auth.api.refreshToken({
			body: { providerId: "google" },
			headers,
		});

		if (!tokens?.accessToken) {
			return null;
		}

		return {
			accessToken: tokens.accessToken,
			scopes: resolveGoogleScopes(tokens),
		};
	} catch {
		return null;
	}
};

const fetchGoogleJson = async <T>(accessToken: string, url: URL): Promise<T> => {
	const response = await fetch(url, {
		headers: {
			Authorization: `Bearer ${accessToken}`,
		},
	});

	if (!response.ok) {
		const responseText = await response.text().catch(() => "");
		const error = new Error(
			`Google Calendar request failed with status ${response.status}.${responseText ? ` ${responseText}` : ""}`,
		) as Error & { status?: number };
		error.status = response.status;
		throw error;
	}

	return (await response.json()) as T;
};

const fetchGoogleJsonWithRetry = async <T>(
	authContext: GoogleAuthContext,
	initialTokens: GoogleAccessTokenResult,
	url: URL,
) => {
	try {
		return await fetchGoogleJson<T>(initialTokens.accessToken, url);
	} catch (error) {
		if (
			!(error instanceof Error) ||
			(error as Error & { status?: number }).status !== 401
		) {
			throw error;
		}

		const refreshedTokens = await refreshGoogleAccessToken(authContext);

		if (!refreshedTokens?.accessToken) {
			throw error;
		}

		return await fetchGoogleJson<T>(refreshedTokens.accessToken, url);
	}
};

const isVisibleCalendar = (calendar: GoogleCalendarListEntry) =>
	Boolean(calendar.id) &&
	calendar.hidden !== true &&
	calendar.selected !== false &&
	calendar.accessRole !== "freeBusyReader";

const hasDeclinedEvent = (event: GoogleCalendarEvent) =>
	event.attendees?.some(
		(attendee) => attendee.self === true && attendee.responseStatus === "declined",
	) ?? false;

const isIgnoredEventType = (event: GoogleCalendarEvent) =>
	event.eventType === "focusTime" ||
	event.eventType === "outOfOffice" ||
	event.eventType === "workingLocation";

const getMeetingUrl = (event: GoogleCalendarEvent) =>
	event.hangoutLink ??
	event.conferenceData?.entryPoints?.find(
		(entryPoint) =>
			entryPoint.entryPointType === "video" && Boolean(entryPoint.uri),
	)?.uri;

const isMeetingEvent = ({
	attendees,
	meetingUrl,
}: {
	attendees?: GoogleCalendarEvent["attendees"];
	meetingUrl?: string;
}) =>
	Boolean(meetingUrl) ||
	(attendees?.some((attendee) => attendee.self !== true) ?? false);

const toDate = (value: GoogleCalendarDateTime | undefined, isEnd: boolean) => {
	if (!value) {
		return null;
	}

	if (value.dateTime) {
		return new Date(value.dateTime);
	}

	if (value.date) {
		if (isEnd) {
			return new Date(new Date(`${value.date}T00:00:00`).getTime() - 1);
		}

		return new Date(`${value.date}T00:00:00`);
	}

	return null;
};

const normalizeUpcomingEvent = (
	calendar: GoogleCalendarListEntry,
	event: GoogleCalendarEvent,
	now: number,
): UpcomingCalendarEvent | null => {
	if (!event.id || event.status === "cancelled") {
		return null;
	}

	if (hasDeclinedEvent(event) || isIgnoredEventType(event)) {
		return null;
	}

	const startAt = toDate(event.start, false);
	const endAt = toDate(event.end, true) ?? startAt;

	if (!startAt || !endAt) {
		return null;
	}

	if (endAt.getTime() < now) {
		return null;
	}

	const meetingUrl = getMeetingUrl(event);

	return {
		id: event.iCalUID ?? event.id,
		calendarId: calendar.id,
		calendarName: calendar.summary || "Calendar",
		title: event.summary?.trim() || "Untitled event",
		startAt: startAt.toISOString(),
		endAt: endAt.toISOString(),
		isAllDay: Boolean(event.start?.date && !event.start?.dateTime),
		isMeeting: isMeetingEvent({
			attendees: event.attendees,
			meetingUrl,
		}),
		htmlLink: event.htmlLink,
		meetingUrl,
		location: event.location?.trim() || undefined,
	};
};

const sortAndLimitUpcomingEvents = (events: UpcomingCalendarEvent[]) =>
	events
		.sort(
			(left, right) =>
				new Date(left.startAt).getTime() - new Date(right.startAt).getTime(),
		)
		.slice(0, UPCOMING_EVENTS_LIMIT);

const dedupeUpcomingEvents = (events: UpcomingCalendarEvent[]) => {
	const dedupedEvents = new Map<string, UpcomingCalendarEvent>();

	for (const event of events) {
		const key = `${event.id}:${event.startAt}`;

		if (!dedupedEvents.has(key)) {
			dedupedEvents.set(key, event);
		}
	}

	return Array.from(dedupedEvents.values());
};

const fetchGoogleUpcomingEvents = async ({
	authContext,
	now,
	timeMax,
	timeMin,
}: {
	authContext: GoogleAuthContext;
	now: number;
	timeMax: string;
	timeMin: string;
}): Promise<UpcomingEventsFetchResult> => {
	const googleTokens = await getGoogleAccessToken(authContext);

	if (
		!googleTokens?.accessToken ||
		!googleTokens.scopes.includes(GOOGLE_CALENDAR_SCOPE)
	) {
		return {
			connectedCalendarCount: 0,
			events: [] as UpcomingCalendarEvent[],
		};
	}

	const calendarListUrl = new URL(
		"https://www.googleapis.com/calendar/v3/users/me/calendarList",
	);
	calendarListUrl.searchParams.set("showDeleted", "false");
	calendarListUrl.searchParams.set("minAccessRole", "reader");

	const calendarList = await fetchGoogleJsonWithRetry<GoogleCalendarListResponse>(
		authContext,
		googleTokens,
		calendarListUrl,
	);
	const calendars = (calendarList.items ?? []).filter(isVisibleCalendar);

	if (calendars.length === 0) {
		return {
			connectedCalendarCount: 0,
			events: [] as UpcomingCalendarEvent[],
		};
	}

	const perCalendarEvents = await Promise.all(
		calendars.map(async (calendar) => {
			const eventsUrl = new URL(
				`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`,
			);
			eventsUrl.searchParams.set("singleEvents", "true");
			eventsUrl.searchParams.set("orderBy", "startTime");
			eventsUrl.searchParams.set("showDeleted", "false");
			eventsUrl.searchParams.set("timeMin", timeMin);
			eventsUrl.searchParams.set("timeMax", timeMax);
			eventsUrl.searchParams.set("maxResults", String(UPCOMING_EVENTS_LIMIT));

			try {
				const response =
					await fetchGoogleJsonWithRetry<GoogleCalendarEventsResponse>(
						authContext,
						googleTokens,
						eventsUrl,
					);

				return (response.items ?? [])
					.map((event) => normalizeUpcomingEvent(calendar, event, now))
					.filter((event): event is UpcomingCalendarEvent => event !== null);
			} catch {
				return [];
			}
		}),
	);

	return {
		connectedCalendarCount: calendars.length,
		events: perCalendarEvents.flat(),
	};
};

const fetchYandexUpcomingEvents = async ({
	ctx,
	now,
	timeMax,
	timeMin,
	workspaceId,
}: {
	ctx: ActionCtx;
	now: number;
	timeMax: number;
	timeMin: number;
	workspaceId: Id<"workspaces">;
}): Promise<UpcomingEventsFetchResult> => {
	const identity = await ctx.auth.getUserIdentity();

	if (!identity) {
		return {
			connectedCalendarCount: 0,
			events: [] as UpcomingCalendarEvent[],
		};
	}

	const connection: {
		provider: "yandex-calendar";
		displayName: string;
		email: string;
		password: string;
		serverAddress: string;
		calendarHomePath: string;
	} | null = await ctx.runQuery(
		internal.appConnections.getYandexCalendarCredentials,
		{
			ownerTokenIdentifier: identity.tokenIdentifier,
			workspaceId,
		},
	);

	if (!connection) {
		return {
			connectedCalendarCount: 0,
			events: [] as UpcomingCalendarEvent[],
		};
	}

	try {
		return await listYandexUpcomingEvents({
			connection,
			now,
			timeMax,
			timeMin,
		});
	} catch {
		return {
			connectedCalendarCount: 0,
			events: [] as UpcomingCalendarEvent[],
		};
	}
};

export const listUpcomingGoogleEvents = action({
	args: {
		workspaceId: v.id("workspaces"),
		timeMax: v.string(),
		timeMin: v.string(),
	},
	returns: upcomingEventsResponseValidator,
	handler: async (ctx, args): Promise<UpcomingEventsResponse> => {
		const identity = await ctx.auth.getUserIdentity();

		if (!identity) {
			return {
				status: "not_connected" as const,
				events: [] as UpcomingCalendarEvent[],
			};
		}

		try {
			const authContext = await getGoogleAuthContext(ctx);
			const calendarVisibilityPreferences: CalendarVisibilityPreferences =
				await ctx.runQuery(api.calendarPreferences.get, {
					workspaceId: args.workspaceId,
				});
			if (
				!calendarVisibilityPreferences.showGoogleCalendar &&
				!calendarVisibilityPreferences.showYandexCalendar
			) {
				return {
					status: "not_connected" as const,
					events: [] as UpcomingCalendarEvent[],
				};
			}
			const now = Date.now();
			const requestedWindow = getRequestedCalendarWindow(args);
			const [googleCalendarResult, yandexCalendarResult] = await Promise.all([
				calendarVisibilityPreferences.showGoogleCalendar
					? fetchGoogleUpcomingEvents({
							authContext,
							now,
							timeMin: new Date(requestedWindow.timeMin).toISOString(),
							timeMax: new Date(requestedWindow.timeMax).toISOString(),
						})
					: Promise.resolve({
							connectedCalendarCount: 0,
							events: [] as UpcomingCalendarEvent[],
						}),
				calendarVisibilityPreferences.showYandexCalendar
					? fetchYandexUpcomingEvents({
							ctx,
							now,
							timeMin: requestedWindow.timeMin,
							timeMax: requestedWindow.timeMax,
							workspaceId: args.workspaceId,
						})
					: Promise.resolve({
							connectedCalendarCount: 0,
							events: [] as UpcomingCalendarEvent[],
						}),
			]);
			const connectedCalendarCount =
				googleCalendarResult.connectedCalendarCount +
				yandexCalendarResult.connectedCalendarCount;
			const events = sortAndLimitUpcomingEvents(
				dedupeUpcomingEvents([
					...googleCalendarResult.events,
					...yandexCalendarResult.events,
				]).filter((event) => event.isMeeting),
			);

			if (connectedCalendarCount === 0) {
				return {
					status: "not_connected" as const,
					events: [] as UpcomingCalendarEvent[],
				};
			}

			return {
				status: "ready" as const,
				events,
				connectedCalendarCount,
			};
		} catch (error) {
			if (
				error instanceof Error &&
				"status" in error &&
				error.status === 401
			) {
				return {
					status: "not_connected" as const,
					events: [] as UpcomingCalendarEvent[],
				};
			}

			throw error;
		}
	},
});
