import { useAction, useQuery } from "convex/react";
import * as React from "react";
import type { ChatAppSourceProvider } from "@/lib/chat-source-display";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export type AppSource = {
	id: string;
	title: string;
	preview: string;
	provider: ChatAppSourceProvider;
};

export function useAppSources(
	workspaceId: Id<"workspaces"> | null | undefined,
) {
	const connectionSources = useQuery(
		api.appConnections.listSources,
		workspaceId ? { workspaceId } : "skip",
	);
	const listGoogleSources = useAction(api.googleTools.listAvailableSources);
	const [googleSources, setGoogleSources] = React.useState<AppSource[]>([]);

	React.useEffect(() => {
		let cancelled = false;
		setGoogleSources([]);

		if (!workspaceId) {
			return () => {
				cancelled = true;
			};
		}

		void listGoogleSources({})
			.then((sources) => {
				if (!cancelled) {
					setGoogleSources(sources);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setGoogleSources([]);
				}
			});

		return () => {
			cancelled = true;
		};
	}, [listGoogleSources, workspaceId]);

	return React.useMemo(
		() => [...googleSources, ...(connectionSources ?? [])],
		[connectionSources, googleSources],
	);
}
