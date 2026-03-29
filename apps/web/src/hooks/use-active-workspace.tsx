import * as React from "react";
import type { Id } from "../../../../convex/_generated/dataModel";

const ActiveWorkspaceContext = React.createContext<Id<"workspaces"> | null>(
	null,
);

export function ActiveWorkspaceProvider({
	workspaceId,
	children,
}: {
	workspaceId: Id<"workspaces"> | null;
	children: React.ReactNode;
}) {
	return (
		<ActiveWorkspaceContext.Provider value={workspaceId}>
			{children}
		</ActiveWorkspaceContext.Provider>
	);
}

export function useActiveWorkspaceId() {
	return React.useContext(ActiveWorkspaceContext);
}
