import { ConvexBetterAuthProvider } from "@convex-dev/better-auth/react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "./index.css";
import { Toaster } from "@workspace/ui/components/sonner";
import { ThemeProvider } from "@workspace/ui/components/theme-provider";
import App from "./App.tsx";
import { MeetingWidgetScreen } from "./components/desktop/meeting-widget-screen";
import { initializeAuthClient } from "./lib/auth-client";
import { initializeConvexClient } from "./lib/convex";
import { loadRuntimeConfig } from "./lib/runtime-config";

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Root element #root was not found");
}

const root = createRoot(rootElement);
const meetingWidgetPathname = "/desktop/meeting-widget";

const isMeetingWidgetRoute = () =>
	typeof window !== "undefined" &&
	window.location.pathname === meetingWidgetPathname;

async function bootstrap() {
	if (isMeetingWidgetRoute()) {
		root.render(
			<StrictMode>
				<ThemeProvider>
					<MeetingWidgetScreen />
				</ThemeProvider>
			</StrictMode>,
		);
		return;
	}

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
