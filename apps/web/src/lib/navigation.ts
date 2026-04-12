import { Home, Inbox, MessageCircle, Search, UsersRound } from "lucide-react";

export const SIDEBAR_NAVIGATION = [
	{
		title: "Search",
		action: "search",
		icon: Search,
	},
	{
		title: "Home",
		action: "view",
		view: "home",
		icon: Home,
	},
	{
		title: "Shared",
		action: "view",
		view: "shared",
		icon: UsersRound,
	},
	{
		title: "Ask AI",
		action: "view",
		view: "chat",
		icon: MessageCircle,
	},
	{
		title: "Inbox",
		action: "inbox",
		icon: Inbox,
	},
] as const;

export function getSidebarViewTitle(view: "home" | "chat" | "shared") {
	const item = SIDEBAR_NAVIGATION.find(
		(item) => item.action === "view" && item.view === view,
	);

	if (!item) {
		throw new Error(`Missing sidebar navigation title for view: ${view}`);
	}

	return item.title;
}
