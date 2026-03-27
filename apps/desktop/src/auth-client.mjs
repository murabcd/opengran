import Conf from "conf";
import { app } from "electron";

const cookieStore = new Conf({
	cwd: app.getPath("userData"),
	projectName: app.getName(),
	projectVersion: app.getVersion(),
	configName: "desktop-auth",
});
const authBasePath = "/api/auth";

const getAuthBaseUrl = () => {
	const value = process.env.CONVEX_SITE_URL?.trim();

	if (!value) {
		throw new Error("CONVEX_SITE_URL is not configured.");
	}

	return value;
};

const readCookieJar = () => {
	const stored = cookieStore.get("cookieJar");
	return stored && typeof stored === "object" ? stored : {};
};

const writeCookieJar = (value) => {
	cookieStore.set("cookieJar", value);
};

const parseSetCookieHeader = (headerValue) => {
	const [nameValue, ...attributeEntries] = headerValue.split(";");
	const [name, ...valueParts] = nameValue.trim().split("=");
	const value = valueParts.join("=");

	if (!name || !value) {
		return null;
	}

	const attributes = {};

	for (const entry of attributeEntries) {
		const [attributeName, ...attributeValueParts] = entry.trim().split("=");
		attributes[attributeName.toLowerCase()] = attributeValueParts.join("=");
	}

	return {
		name,
		value,
		attributes,
	};
};

const getSetCookieHeaders = (headers) => {
	if (typeof headers.getSetCookie === "function") {
		return headers.getSetCookie();
	}

	const combined = headers.get("set-cookie");
	return combined ? [combined] : [];
};

const mergeSetCookieHeaders = (headers) => {
	const nextCookieJar = {
		...readCookieJar(),
	};

	for (const headerValue of getSetCookieHeaders(headers)) {
		const parsed = parseSetCookieHeader(headerValue);

		if (!parsed) {
			continue;
		}

		const maxAge =
			typeof parsed.attributes["max-age"] === "string"
				? Number(parsed.attributes["max-age"])
				: null;
		const expires =
			maxAge !== null && Number.isFinite(maxAge)
				? new Date(Date.now() + maxAge * 1000).toISOString()
				: typeof parsed.attributes.expires === "string"
					? new Date(parsed.attributes.expires).toISOString()
					: null;

		nextCookieJar[parsed.name] = {
			value: parsed.value,
			expires,
		};
	}

	writeCookieJar(nextCookieJar);
};

const getCookie = () => {
	const now = Date.now();
	const currentCookieJar = readCookieJar();
	const nextCookieJar = {};
	const cookieParts = [];

	for (const [name, entry] of Object.entries(currentCookieJar)) {
		if (
			!entry ||
			typeof entry !== "object" ||
			typeof entry.value !== "string"
		) {
			continue;
		}

		if (
			typeof entry.expires === "string" &&
			Number.isFinite(Date.parse(entry.expires)) &&
			Date.parse(entry.expires) <= now
		) {
			continue;
		}

		nextCookieJar[name] = entry;
		cookieParts.push(`${name}=${entry.value}`);
	}

	writeCookieJar(nextCookieJar);
	return cookieParts.join("; ");
};

const parseResponse = async (response) => {
	if (response.status === 204) {
		return null;
	}

	const contentType = response.headers.get("content-type") ?? "";

	if (contentType.includes("application/json")) {
		return await response.json();
	}

	const text = await response.text();
	return text ? text : null;
};

const toAbsoluteUrl = (path) =>
	new URL(`${authBasePath}${path}`, getAuthBaseUrl()).toString();

const authFetch = async (path, options = {}) => {
	const requestHeaders = new Headers(options.headers ?? {});
	const cookie = getCookie();
	const authBaseUrl = getAuthBaseUrl();
	const authOrigin = new URL(authBaseUrl).origin;

	if (cookie && !requestHeaders.has("cookie")) {
		requestHeaders.set("cookie", cookie);
	}

	if (!requestHeaders.has("origin")) {
		requestHeaders.set("origin", authOrigin);
	}

	if (!requestHeaders.has("referer")) {
		requestHeaders.set("referer", `${authBaseUrl.replace(/\/$/u, "")}/`);
	}

	const response = await fetch(toAbsoluteUrl(path), {
		method: options.method ?? "GET",
		headers: requestHeaders,
		body: options.body,
		redirect: "follow",
	});

	mergeSetCookieHeaders(response.headers);

	const data = await parseResponse(response);

	if (!response.ok && options.throw) {
		const message =
			data &&
			typeof data === "object" &&
			"message" in data &&
			typeof data.message === "string"
				? data.message
				: response.statusText || "Request failed.";

		throw new Error(message);
	}

	return data;
};

export const getDesktopAuthClient = () => ({
	getCookie,
	$fetch: authFetch,
});
