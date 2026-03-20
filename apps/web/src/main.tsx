import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { ThemeProvider } from "@workspace/ui/components/theme-provider";
import App from "./App.tsx";
import { authClient } from "./lib/auth-client";
import { convex } from "./lib/convex";

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Root element #root was not found");
}

createRoot(rootElement).render(
	<StrictMode>
		<ConvexBetterAuthProvider client={convex} authClient={authClient}>
			<ThemeProvider>
				<App />
			</ThemeProvider>
		</ConvexBetterAuthProvider>
	</StrictMode>,
);
