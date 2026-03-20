import { ConvexReactClient } from "convex/react";

function getEnv(...names: Array<keyof ImportMetaEnv>) {
	for (const name of names) {
		const value = import.meta.env[name];

		if (value) {
			return value;
		}
	}

	throw new Error(
		`Missing required client environment variable: ${names.join(" or ")}`,
	);
}

export const convex = new ConvexReactClient(
	getEnv("VITE_CONVEX_URL", "CONVEX_URL"),
	{
		unsavedChangesWarning: false,
	},
);
