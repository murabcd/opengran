import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { Toaster } from "@workspace/ui/components/sonner";
import { ThemeProvider } from "@workspace/ui/components/theme-provider";
import App from "./App.tsx";
import { initializeAuthClient } from "./lib/auth-client";
import { initializeConvexClient } from "./lib/convex";
import { loadRuntimeConfig } from "./lib/runtime-config";

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Root element #root was not found");
}

const root = createRoot(rootElement);

async function bootstrap() {
	const runtimeConfig = await loadRuntimeConfig();

	const convex = initializeConvexClient(runtimeConfig.convexUrl);
	const authClient = initializeAuthClient(
		runtimeConfig.convexSiteUrl,
		runtimeConfig.isDesktop,
	);

	root.render(
		<StrictMode>
			<ConvexBetterAuthProvider client={convex} authClient={authClient}>
				<ThemeProvider>
					<App />
					<Toaster />
				</ThemeProvider>
			</ConvexBetterAuthProvider>
		</StrictMode>,
	);
}

void bootstrap();
