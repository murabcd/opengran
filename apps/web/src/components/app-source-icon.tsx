import { Icons } from "@workspace/ui/components/icons";
import type { ChatAppSourceProvider } from "@/lib/chat-source-display";

export function AppSourceIcon({
	provider,
	className,
}: {
	provider: ChatAppSourceProvider;
	className?: string;
}) {
	switch (provider) {
		case "google-calendar":
			return <Icons.googleCalendarLogo className={className} />;
		case "google-drive":
			return <Icons.googleDriveLogo className={className} />;
		case "jira":
		case "jira-mcp":
			return <Icons.jiraLogo className={className} />;
		case "notion":
			return <Icons.notionLogo className={className} />;
		case "posthog":
			return <Icons.planeLogo className={className} />;
		case "zoom":
			return <Icons.zoomLogo className={className} />;
		case "yandex-calendar":
			return <Icons.yandexCalendarLogo className={className} />;
		case "yandex-tracker":
			return (
				<Icons.yandexTrackerLogo
					className={`${className ?? ""} text-blue-500`}
				/>
			);
	}

	const exhaustiveProvider: never = provider;
	return exhaustiveProvider;
}
