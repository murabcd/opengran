import {
	type LucideIcon,
	MessageCircle,
	Rocket,
	TrendingUp,
	Users,
} from "lucide-react";

const workspaceRoleValues = [
	"startup-generalist",
	"investing",
	"recruiting",
	"customer-facing",
] as const;

type WorkspaceRole = (typeof workspaceRoleValues)[number];

type WorkspaceRoleOption = {
	value: WorkspaceRole;
	title: string;
	description: string;
	summary: string;
	icon: LucideIcon;
};

const workspaceRoleOptions: WorkspaceRoleOption[] = [
	{
		value: "startup-generalist",
		title: "Startup / Generalist",
		description: "Fast-moving teams wearing a lot of hats.",
		summary: "Meeting notes",
		icon: Rocket,
	},
	{
		value: "investing",
		title: "Investing",
		description: "Research, diligence, updates, and portfolio work.",
		summary: "Investor workspace",
		icon: TrendingUp,
	},
	{
		value: "recruiting",
		title: "Recruiting",
		description: "Interviews, scorecards, and hiring collaboration.",
		summary: "Hiring workspace",
		icon: Users,
	},
	{
		value: "customer-facing",
		title: "Customer-facing",
		description: "Calls, discovery, support, and follow-ups.",
		summary: "Customer workspace",
		icon: MessageCircle,
	},
];

const workspaceRoleOptionsByValue = new Map(
	workspaceRoleOptions.map((option) => [option.value, option]),
);

export const getWorkspaceRoleOption = (role: string | undefined | null) => {
	if (!role) {
		return workspaceRoleOptions[0];
	}

	return (
		workspaceRoleOptionsByValue.get(role as WorkspaceRole) ??
		workspaceRoleOptions[0]
	);
};

export const getSuggestedWorkspaceName = (name: string | null | undefined) => {
	const trimmedName = name?.trim();

	if (!trimmedName) {
		return "My workspace";
	}

	const firstName = trimmedName.split(/\s+/)[0];
	return `${firstName}'s workspace`;
};
