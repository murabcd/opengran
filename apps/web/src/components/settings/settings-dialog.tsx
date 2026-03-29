import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "@workspace/ui/components/alert-dialog";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@workspace/ui/components/avatar";
import {
	Breadcrumb,
	BreadcrumbItem,
	BreadcrumbLink,
	BreadcrumbList,
	BreadcrumbPage,
	BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb";
import { Button } from "@workspace/ui/components/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@workspace/ui/components/dialog";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldGroup,
} from "@workspace/ui/components/field";
import { Icons } from "@workspace/ui/components/icons";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
} from "@workspace/ui/components/select";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
} from "@workspace/ui/components/sidebar";
import { useTheme } from "@workspace/ui/components/theme-provider";
import { useAction, useMutation, useQuery } from "convex/react";
import {
	CalendarDays,
	Database,
	FolderKanban,
	ImageUp,
	Link2,
	LoaderCircle,
	Paintbrush,
	UserRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useActiveWorkspaceId } from "@/hooks/use-active-workspace";
import { authClient } from "@/lib/auth-client";
import { getAvatarSrc } from "@/lib/avatar";
import type { WorkspaceRecord } from "@/lib/workspaces";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

type SettingsUser = {
	name: string;
	email: string;
	avatar: string;
};

export type SettingsPage =
	| "Profile"
	| "Appearance"
	| "Workspace"
	| "Calendar"
	| "Connections"
	| "Data controls";

type SettingsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	user: SettingsUser;
	workspace: WorkspaceRecord | null;
	onUserChange: (user: SettingsUser) => void;
	initialPage?: SettingsPage;
	onPageChange?: (page: SettingsPage) => void;
};

const settingsNav = [
	{ name: "Profile", icon: UserRound },
	{ name: "Appearance", icon: Paintbrush },
	{ name: "Workspace", icon: FolderKanban },
	{ name: "Calendar", icon: CalendarDays },
	{ name: "Connections", icon: Link2 },
	{ name: "Data controls", icon: Database },
] as const;

const GOOGLE_CALENDAR_SCOPES = [
	"openid",
	"email",
	"profile",
	"https://www.googleapis.com/auth/calendar.readonly",
] as const;

const SETTINGS_LABEL_CLASSNAME = "text-xs text-muted-foreground";

const withoutTrailingPeriod = (message: string) =>
	message.trimEnd().replace(/\.+$/u, "");

type LinkedAccount = {
	id: string;
	providerId: string;
	accountId: string;
	scopes: string[];
};

type WorkspaceFormState = {
	name: string;
	iconStorageId: Id<"_storage"> | null;
	iconPreviewUrl: string | null;
};

type DataControlsState = {
	showDeleteAccountDialog: boolean;
	isDeletingAccount: boolean;
	showDeleteAllNotesDialog: boolean;
	isDeletingAllNotes: boolean;
	showDeleteAllChatsDialog: boolean;
	isDeletingAllChats: boolean;
};

type YandexTrackerOrgType = "x-org-id" | "x-cloud-org-id";

type YandexTrackerConnectionFormState = {
	orgType: YandexTrackerOrgType;
	orgId: string;
	token: string;
};

const getWorkspaceFormState = (
	workspace: WorkspaceRecord | null,
): WorkspaceFormState => ({
	name: workspace?.name ?? "",
	iconStorageId: workspace?.iconStorageId ?? null,
	iconPreviewUrl: null,
});

const initialDataControlsState: DataControlsState = {
	showDeleteAccountDialog: false,
	isDeletingAccount: false,
	showDeleteAllNotesDialog: false,
	isDeletingAllNotes: false,
	showDeleteAllChatsDialog: false,
	isDeletingAllChats: false,
};

const initialYandexTrackerConnectionFormState: YandexTrackerConnectionFormState =
	{
		orgType: "x-org-id",
		orgId: "",
		token: "",
	};

export function SettingsDialog({
	open,
	onOpenChange,
	user,
	workspace,
	onUserChange,
	initialPage = "Profile",
	onPageChange,
}: SettingsDialogProps) {
	const [selectedPage, setSelectedPage] = useState<SettingsPage | null>(null);
	const { data: session } = authClient.useSession();
	const activePage = selectedPage ?? initialPage;

	const handlePageSelect = (page: SettingsPage) => {
		setSelectedPage(page);
		onPageChange?.(page);
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(nextOpen) => {
				setSelectedPage(null);
				onOpenChange(nextOpen);
			}}
		>
			<DialogContent className="overflow-hidden p-0 md:max-h-[500px] md:max-w-[700px] lg:max-w-[800px]">
				<DialogHeader className="sr-only">
					<DialogTitle>Settings</DialogTitle>
					<DialogDescription>Manage your OpenGran settings.</DialogDescription>
				</DialogHeader>
				<DialogDescription className="sr-only">
					Manage your OpenGran settings.
				</DialogDescription>
				<SidebarProvider className="items-start">
					<Sidebar collapsible="none" className="hidden md:flex">
						<SidebarContent>
							<SidebarGroup>
								<SidebarGroupContent>
									<SidebarMenu>
										{settingsNav.map((item) => (
											<SidebarMenuItem key={item.name}>
												<SidebarMenuButton
													asChild
													isActive={activePage === item.name}
												>
													<button
														type="button"
														onClick={() => handlePageSelect(item.name)}
													>
														<item.icon />
														<span>{item.name}</span>
													</button>
												</SidebarMenuButton>
											</SidebarMenuItem>
										))}
									</SidebarMenu>
								</SidebarGroupContent>
							</SidebarGroup>
						</SidebarContent>
					</Sidebar>
					<main className="flex h-[480px] flex-1 flex-col overflow-hidden">
						<header className="flex min-h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
							<div className="flex items-center gap-2 px-4">
								<Breadcrumb className="hidden md:block">
									<BreadcrumbList>
										<BreadcrumbItem className="hidden md:block">
											<BreadcrumbLink href="#">Settings</BreadcrumbLink>
										</BreadcrumbItem>
										<BreadcrumbSeparator className="hidden md:block" />
										<BreadcrumbItem>
											<BreadcrumbPage>{activePage}</BreadcrumbPage>
										</BreadcrumbItem>
									</BreadcrumbList>
								</Breadcrumb>
								<div className="flex gap-2 overflow-x-auto py-2 md:hidden">
									{settingsNav.map((item) => (
										<Button
											key={item.name}
											variant={activePage === item.name ? "secondary" : "ghost"}
											size="sm"
											onClick={() => handlePageSelect(item.name)}
										>
											<item.icon />
											{item.name}
										</Button>
									))}
								</div>
							</div>
						</header>
						<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
							{activePage === "Profile" ? (
								<ManageAccountForm
									user={user}
									onCancel={() => onOpenChange(false)}
									onSave={(nextUser) => {
										onUserChange(nextUser);
										onOpenChange(false);
									}}
								/>
							) : activePage === "Appearance" ? (
								<AppearanceSettings />
							) : activePage === "Workspace" ? (
								<WorkspaceSettings
									workspace={workspace}
									onCancel={() => onOpenChange(false)}
									onSave={() => onOpenChange(false)}
								/>
							) : activePage === "Calendar" ? (
								<CalendarSettings />
							) : activePage === "Connections" ? (
								<ConnectionsSettings />
							) : activePage === "Data controls" ? (
								<DataControlsSettings
									canDeleteData={Boolean(session?.user)}
									onClose={() => onOpenChange(false)}
								/>
							) : null}
						</div>
					</main>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
	);
}

function AppearanceSettings() {
	const { theme, setTheme } = useTheme();

	const themeOptions = [
		{
			value: "light",
			label: "Light",
		},
		{
			value: "dark",
			label: "Dark",
		},
	] as const;
	const selectedTheme =
		theme === "dark" ||
		(theme === "system" && document.documentElement.classList.contains("dark"))
			? "dark"
			: "light";

	return (
		<div className="py-4">
			<FieldGroup className="gap-6">
				<Field
					orientation="responsive"
					className="@md/field-group:items-center @md/field-group:has-[>[data-slot=field-content]]:items-center"
				>
					<FieldContent className="@md/field-group:justify-center">
						<Label>Theme</Label>
					</FieldContent>
					<Select
						value={selectedTheme}
						onValueChange={(value) => setTheme(value as "light" | "dark")}
					>
						<SelectTrigger
							size="sm"
							className="w-full cursor-pointer justify-between @md/field-group:w-48"
							aria-label="Select theme"
						>
							<span>{selectedTheme === "dark" ? "Dark" : "Light"}</span>
						</SelectTrigger>
						<SelectContent align="end">
							{themeOptions.map(({ value, label }) => (
								<SelectItem key={value} value={value}>
									<span>{label}</span>
								</SelectItem>
							))}
						</SelectContent>
					</Select>
				</Field>
			</FieldGroup>
		</div>
	);
}

function CalendarSettings() {
	const { data: session } = authClient.useSession();
	const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
	const [isLoadingAccounts, setIsLoadingAccounts] = useState(false);
	const [isConnectingGoogle, setIsConnectingGoogle] = useState(false);

	const loadAccounts = useCallback(async () => {
		if (!session?.user) {
			setAccounts([]);
			return;
		}

		setIsLoadingAccounts(true);

		try {
			const result = await authClient.$fetch("/list-accounts", {
				method: "GET",
				throw: true,
			});
			setAccounts(Array.isArray(result) ? (result as LinkedAccount[]) : []);
		} catch (error) {
			console.error("Failed to load linked accounts", error);
			toast.error("Failed to load linked calendar accounts");
		} finally {
			setIsLoadingAccounts(false);
		}
	}, [session?.user]);

	useEffect(() => {
		void loadAccounts();
	}, [loadAccounts]);

	useEffect(() => {
		const handleFocus = () => {
			void loadAccounts();
		};

		window.addEventListener("focus", handleFocus);
		return () => window.removeEventListener("focus", handleFocus);
	}, [loadAccounts]);

	const googleAccount = accounts.find(
		(account) => account.providerId === "google",
	);
	const hasCalendarScope =
		googleAccount?.scopes.includes(
			"https://www.googleapis.com/auth/calendar.readonly",
		) ?? false;

	const handleConnectGoogleCalendar = async () => {
		setIsConnectingGoogle(true);

		try {
			const callbackURL = window.openGranDesktop
				? (await window.openGranDesktop.getAuthCallbackUrl()).url
				: window.location.href;
			const result = await authClient.$fetch("/link-social", {
				method: "POST",
				throw: true,
				body: {
					provider: "google",
					callbackURL,
					errorCallbackURL: callbackURL,
					disableRedirect: true,
					scopes: [...GOOGLE_CALENDAR_SCOPES],
				},
			});
			const resultObject = result && typeof result === "object" ? result : null;
			const url =
				resultObject && "url" in resultObject
					? String(resultObject.url ?? "")
					: "";
			const linkedWithoutRedirect =
				resultObject !== null &&
				"status" in resultObject &&
				Boolean(resultObject.status) &&
				"redirect" in resultObject &&
				resultObject.redirect === false;

			if (!url) {
				if (linkedWithoutRedirect) {
					await loadAccounts();
					toast.success("Google account linked");
					return;
				}

				throw new Error("Google calendar auth URL was not returned.");
			}

			if (window.openGranDesktop) {
				await window.openGranDesktop.openExternalUrl(url);
			} else {
				window.location.assign(url);
			}
		} catch (error) {
			console.error("Failed to connect Google Calendar", error);
			toast.error(
				error instanceof Error
					? withoutTrailingPeriod(error.message)
					: "Failed to connect Google Calendar",
			);
		} finally {
			setIsConnectingGoogle(false);
		}
	};

	return (
		<div className="py-4">
			<Field>
				<Label className={SETTINGS_LABEL_CLASSNAME}>Calendars</Label>
				<div className="flex items-center justify-between gap-4">
					<div className="flex min-w-0 items-center gap-3">
						<Icons.googleLogo className="size-5 shrink-0" />
						<div className="min-w-0">
							<Label className="text-sm font-medium text-foreground">
								Google Calendar
							</Label>
						</div>
					</div>
					<Button
						type="button"
						variant={googleAccount ? "outline" : "default"}
						onClick={handleConnectGoogleCalendar}
						disabled={isConnectingGoogle || !session?.user || isLoadingAccounts}
					>
						{isConnectingGoogle ? (
							<LoaderCircle className="animate-spin" />
						) : null}
						{googleAccount
							? hasCalendarScope
								? "Reconnect"
								: "Grant calendar access"
							: "Connect"}
					</Button>
				</div>
			</Field>
		</div>
	);
}

function ConnectionsSettings() {
	const yandexTrackerConnection = useQuery(
		api.appConnections.getYandexTracker,
		{},
	);
	const connectYandexTracker = useAction(
		api.appConnectionActions.connectYandexTracker,
	);
	const [isYandexTrackerDialogOpen, setIsYandexTrackerDialogOpen] =
		useState(false);
	const [formState, setFormState] = useState<YandexTrackerConnectionFormState>(
		initialYandexTrackerConnectionFormState,
	);
	const [isSavingYandexTrackerConnection, setIsSavingYandexTrackerConnection] =
		useState(false);

	const handleYandexTrackerDialogOpenChange = (open: boolean) => {
		setIsYandexTrackerDialogOpen(open);

		if (open) {
			setFormState({
				orgType: yandexTrackerConnection?.orgType ?? "x-org-id",
				orgId: yandexTrackerConnection?.orgId ?? "",
				token: "",
			});
		} else {
			setFormState(initialYandexTrackerConnectionFormState);
		}
	};

	const handleConnectYandexTracker = async () => {
		if (!formState.orgId.trim() || !formState.token.trim()) {
			return;
		}

		setIsSavingYandexTrackerConnection(true);

		try {
			await connectYandexTracker({
				orgType: formState.orgType,
				orgId: formState.orgId.trim(),
				token: formState.token.trim(),
			});
			toast.success("Yandex Tracker connected");
			handleYandexTrackerDialogOpenChange(false);
		} catch (error) {
			console.error("Failed to connect Yandex Tracker", error);
			toast.error(
				error instanceof Error
					? withoutTrailingPeriod(error.message)
					: "Failed to connect Yandex Tracker",
			);
		} finally {
			setIsSavingYandexTrackerConnection(false);
		}
	};

	const isYandexTrackerFormValid =
		formState.orgId.trim().length > 0 && formState.token.trim().length > 0;

	return (
		<div className="py-4">
			<Field>
				<Label className={SETTINGS_LABEL_CLASSNAME}>Tools</Label>
				<div className="flex items-center justify-between gap-4">
					<div className="flex min-w-0 items-center gap-3">
						<Icons.yandexTrackerLogo className="size-5 shrink-0 text-blue-500" />
						<div className="min-w-0">
							<Label className="text-sm font-medium text-foreground">
								Yandex Tracker
							</Label>
						</div>
					</div>
					<Button
						type="button"
						variant="outline"
						onClick={() => setIsYandexTrackerDialogOpen(true)}
					>
						{yandexTrackerConnection ? "Reconnect" : "Connect"}
					</Button>
				</div>
			</Field>
			<Dialog
				open={isYandexTrackerDialogOpen}
				onOpenChange={handleYandexTrackerDialogOpenChange}
			>
				<DialogContent className="sm:max-w-md">
					<DialogHeader>
						<DialogTitle>Connect Yandex Tracker</DialogTitle>
						<DialogDescription>
							Enter the credentials OpenGran should use for your Tracker
							connection.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup className="gap-4">
						<Field>
							<FieldContent>
								<Label className={SETTINGS_LABEL_CLASSNAME}>
									Organization type
								</Label>
							</FieldContent>
							<Select
								value={formState.orgType}
								onValueChange={(value) =>
									setFormState((currentState) => ({
										...currentState,
										orgType: value as YandexTrackerOrgType,
									}))
								}
							>
								<SelectTrigger
									size="sm"
									className="w-full cursor-pointer justify-between"
									aria-label="Select Yandex Tracker organization type"
								>
									<span>
										{formState.orgType === "x-org-id"
											? "Yandex 360"
											: "Yandex Cloud"}
									</span>
								</SelectTrigger>
								<SelectContent align="end">
									<SelectItem value="x-org-id">Yandex 360</SelectItem>
									<SelectItem value="x-cloud-org-id">Yandex Cloud</SelectItem>
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<Label
								htmlFor="yandex-tracker-org-id"
								className={SETTINGS_LABEL_CLASSNAME}
							>
								Organization ID
							</Label>
							<Input
								id="yandex-tracker-org-id"
								value={formState.orgId}
								onChange={(event) =>
									setFormState((currentState) => ({
										...currentState,
										orgId: event.target.value,
									}))
								}
								placeholder="1234567"
							/>
						</Field>
						<Field>
							<Label
								htmlFor="yandex-tracker-token"
								className={SETTINGS_LABEL_CLASSNAME}
							>
								OAuth token
							</Label>
							<Input
								id="yandex-tracker-token"
								type="password"
								value={formState.token}
								onChange={(event) =>
									setFormState((currentState) => ({
										...currentState,
										token: event.target.value,
									}))
								}
								placeholder="y0_AgAAAA..."
							/>
						</Field>
					</FieldGroup>
					<div className="flex justify-end gap-2 pt-2">
						<Button
							type="button"
							variant="ghost"
							onClick={() => handleYandexTrackerDialogOpenChange(false)}
							disabled={isSavingYandexTrackerConnection}
						>
							Cancel
						</Button>
						<Button
							type="button"
							onClick={() => {
								void handleConnectYandexTracker();
							}}
							disabled={
								!isYandexTrackerFormValid || isSavingYandexTrackerConnection
							}
						>
							{isSavingYandexTrackerConnection ? (
								<>
									<LoaderCircle className="animate-spin" />
									Connecting
								</>
							) : (
								"Connect"
							)}
						</Button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}

function WorkspaceSettings({
	workspace,
	onCancel,
	onSave,
}: {
	workspace: WorkspaceRecord | null;
	onCancel: () => void;
	onSave: () => void;
}) {
	const generateIconUploadUrl = useMutation(
		api.workspaces.generateIconUploadUrl,
	);
	const updateWorkspace = useMutation(api.workspaces.update);
	const [formState, setFormState] = useState<WorkspaceFormState>(() =>
		getWorkspaceFormState(workspace),
	);
	const [isSaving, setIsSaving] = useState(false);
	const [isUploadingIcon, setIsUploadingIcon] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const { name, iconStorageId, iconPreviewUrl } = formState;

	useEffect(() => {
		setFormState(getWorkspaceFormState(workspace));
	}, [workspace]);

	useEffect(() => {
		if (!iconPreviewUrl?.startsWith("blob:")) {
			return;
		}

		return () => {
			URL.revokeObjectURL(iconPreviewUrl);
		};
	}, [iconPreviewUrl]);

	if (!workspace) {
		return (
			<div className="py-4">
				<FieldGroup>
					<Field>
						<Label className={SETTINGS_LABEL_CLASSNAME}>
							No workspace selected
						</Label>
						<FieldDescription>
							Select a workspace from the sidebar, then reopen settings to edit
							it here.
						</FieldDescription>
					</Field>
				</FieldGroup>
			</div>
		);
	}

	const trimmedName = name.trim();
	const hasChanges =
		trimmedName !== workspace.name ||
		iconStorageId !== (workspace.iconStorageId ?? null);
	const workspaceAvatarSrc = getAvatarSrc({
		avatar: iconPreviewUrl ?? workspace.iconUrl,
		name: trimmedName || workspace.name,
	});

	const handleUpload = async (file: File) => {
		setIsUploadingIcon(true);

		try {
			const uploadUrl = await generateIconUploadUrl();
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: {
					"Content-Type": file.type || "application/octet-stream",
				},
				body: file,
			});

			if (!response.ok) {
				throw new Error("Failed to upload workspace icon.");
			}

			const result = (await response.json()) as { storageId?: Id<"_storage"> };

			if (!result.storageId) {
				throw new Error("Workspace icon upload did not return a storage id.");
			}

			setFormState((currentState) => ({
				...currentState,
				iconStorageId: result.storageId,
				iconPreviewUrl: URL.createObjectURL(file),
			}));
		} catch (error) {
			console.error("Failed to upload workspace icon", error);
			toast.error(
				error instanceof Error
					? withoutTrailingPeriod(error.message)
					: "Failed to upload workspace icon",
			);
		} finally {
			setIsUploadingIcon(false);
		}
	};

	const handleSubmit = async () => {
		if (!trimmedName || isSaving || isUploadingIcon || !hasChanges) {
			return;
		}

		setIsSaving(true);

		try {
			await updateWorkspace({
				workspaceId: workspace._id,
				name: trimmedName,
				iconStorageId:
					iconStorageId !== (workspace.iconStorageId ?? null)
						? (iconStorageId ?? undefined)
						: undefined,
			});
			toast.success("Workspace settings updated");
			onSave();
		} catch (error) {
			console.error("Failed to update workspace", error);
			toast.error(
				error instanceof Error
					? withoutTrailingPeriod(error.message)
					: "Failed to update workspace",
			);
		} finally {
			setIsSaving(false);
		}
	};

	return (
		<div className="py-4">
			<FieldGroup className="gap-6">
				<Field>
					<Label className={SETTINGS_LABEL_CLASSNAME}>Icon</Label>
					<div className="flex items-center gap-4">
						<Avatar className="size-20 rounded-lg border">
							<AvatarImage
								src={workspaceAvatarSrc}
								alt="Workspace icon preview"
								className="object-cover"
							/>
							<AvatarFallback className="rounded-lg bg-muted/40">
								<ImageUp className="size-8 text-muted-foreground" />
							</AvatarFallback>
						</Avatar>
						<div className="flex flex-col gap-2">
							<Button
								variant="outline"
								size="sm"
								className="w-min"
								onClick={() => fileInputRef.current?.click()}
								disabled={isSaving || isUploadingIcon}
							>
								{isUploadingIcon ? "Uploading..." : "Upload"}
							</Button>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/png,image/jpeg,image/gif,image/webp"
								className="hidden"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (!file) {
										return;
									}

									void handleUpload(file);
									event.target.value = "";
								}}
							/>
							<FieldDescription>
								Recommend size 1:1, up to 5MB.
							</FieldDescription>
						</div>
					</div>
				</Field>
				<Field>
					<Label
						htmlFor="settings-workspace-name"
						className={SETTINGS_LABEL_CLASSNAME}
					>
						Name
					</Label>
					<Input
						id="settings-workspace-name"
						value={name}
						onChange={(event) =>
							setFormState((currentState) => ({
								...currentState,
								name: event.target.value,
							}))
						}
						placeholder="My workspace"
						disabled={isSaving}
					/>
				</Field>
			</FieldGroup>
			<div className="flex justify-end gap-2 pt-6">
				<Button variant="ghost" onClick={onCancel} disabled={isSaving}>
					Cancel
				</Button>
				<Button
					onClick={handleSubmit}
					disabled={!trimmedName || !hasChanges || isSaving || isUploadingIcon}
				>
					{isSaving ? (
						<>
							<LoaderCircle className="animate-spin" />
							Saving
						</>
					) : (
						"Save"
					)}
				</Button>
			</div>
		</div>
	);
}

function DataControlsSettings({
	canDeleteData,
	onClose,
}: {
	canDeleteData: boolean;
	onClose: () => void;
}) {
	const activeWorkspaceId = useActiveWorkspaceId();
	const [state, setState] = useState<DataControlsState>(
		initialDataControlsState,
	);
	const removeAllNotes = useMutation(api.notes.removeAll);
	const removeAllChats = useMutation(api.chats.removeAll);
	const removeWorkspace = useMutation(api.workspaces.remove);
	const [showDeleteWorkspaceDialog, setShowDeleteWorkspaceDialog] =
		useState(false);
	const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
	const {
		showDeleteAccountDialog,
		isDeletingAccount,
		showDeleteAllNotesDialog,
		isDeletingAllNotes,
		showDeleteAllChatsDialog,
		isDeletingAllChats,
	} = state;

	const navigateTo = (pathname: string) => {
		window.history.pushState(null, "", pathname);
		window.dispatchEvent(new PopStateEvent("popstate"));
	};

	const handleDeleteAccount = async () => {
		setState((currentState) => ({
			...currentState,
			isDeletingAccount: true,
		}));

		try {
			await authClient.$fetch("/delete-user", {
				method: "POST",
				throw: true,
				body: { callbackURL: "/" },
			});
			setState((currentState) => ({
				...currentState,
				showDeleteAccountDialog: false,
			}));
			onClose();
			window.location.assign("/");
		} catch (error) {
			console.error("Failed to delete account", error);
			setState((currentState) => ({
				...currentState,
				showDeleteAccountDialog: false,
			}));
			toast.error("Failed to delete account");
		} finally {
			setState((currentState) => ({
				...currentState,
				isDeletingAccount: false,
			}));
		}
	};

	const handleDeleteWorkspace = async () => {
		if (!activeWorkspaceId || isDeletingWorkspace) {
			return;
		}

		setIsDeletingWorkspace(true);

		try {
			await removeWorkspace({ workspaceId: activeWorkspaceId });
			setShowDeleteWorkspaceDialog(false);
			onClose();
			navigateTo("/home");
			toast.success("Workspace deleted");
		} catch (error) {
			console.error("Failed to delete workspace", error);
			setShowDeleteWorkspaceDialog(false);
			toast.error(
				error instanceof Error
					? withoutTrailingPeriod(error.message)
					: "Failed to delete workspace",
			);
		} finally {
			setIsDeletingWorkspace(false);
		}
	};

	const handleDeleteAllNotes = async () => {
		setState((currentState) => ({
			...currentState,
			isDeletingAllNotes: true,
		}));

		try {
			if (!activeWorkspaceId) {
				return;
			}

			const result = await removeAllNotes({ workspaceId: activeWorkspaceId });
			setState((currentState) => ({
				...currentState,
				showDeleteAllNotesDialog: false,
			}));
			onClose();
			navigateTo("/home");
			toast.success(
				result.hasMore ? "Note deletion started" : "All notes deleted",
			);
		} catch (error) {
			console.error("Failed to delete all notes", error);
			setState((currentState) => ({
				...currentState,
				showDeleteAllNotesDialog: false,
			}));
			toast.error("Failed to delete all notes");
		} finally {
			setState((currentState) => ({
				...currentState,
				isDeletingAllNotes: false,
			}));
		}
	};

	const handleDeleteAllChats = async () => {
		setState((currentState) => ({
			...currentState,
			isDeletingAllChats: true,
		}));

		try {
			if (!activeWorkspaceId) {
				return;
			}

			const result = await removeAllChats({ workspaceId: activeWorkspaceId });
			setState((currentState) => ({
				...currentState,
				showDeleteAllChatsDialog: false,
			}));
			onClose();
			navigateTo("/home");
			toast.success(
				result.hasMore ? "Chat deletion started" : "All chats deleted",
			);
		} catch (error) {
			console.error("Failed to delete all chats", error);
			setState((currentState) => ({
				...currentState,
				showDeleteAllChatsDialog: false,
			}));
			toast.error("Failed to delete all chats");
		} finally {
			setState((currentState) => ({
				...currentState,
				isDeletingAllChats: false,
			}));
		}
	};

	return (
		<div className="py-4">
			<FieldGroup className="gap-6">
				<Field>
					<Label className={SETTINGS_LABEL_CLASSNAME}>Workspace</Label>
					<DataControlAction
						title="Delete all notes"
						buttonLabel={isDeletingAllNotes ? "Deleting..." : "Delete"}
						dialogOpen={showDeleteAllNotesDialog}
						onDialogOpenChange={(open) => {
							setState((currentState) => ({
								...currentState,
								showDeleteAllNotesDialog: open,
							}));
						}}
						onConfirm={handleDeleteAllNotes}
						confirmDisabled={isDeletingAllNotes}
						buttonDisabled={isDeletingAllNotes || !canDeleteData}
						dialogDescription="This action cannot be undone. All notes you own will be permanently deleted."
					/>
					<DataControlAction
						title="Delete all chats"
						buttonLabel={isDeletingAllChats ? "Deleting..." : "Delete"}
						dialogOpen={showDeleteAllChatsDialog}
						onDialogOpenChange={(open) => {
							setState((currentState) => ({
								...currentState,
								showDeleteAllChatsDialog: open,
							}));
						}}
						onConfirm={handleDeleteAllChats}
						confirmDisabled={isDeletingAllChats}
						buttonDisabled={isDeletingAllChats || !canDeleteData}
						dialogDescription="This action cannot be undone. All chats you own will be permanently deleted."
					/>
					<DataControlAction
						title="Delete workspace"
						buttonLabel={isDeletingWorkspace ? "Deleting..." : "Delete"}
						dialogOpen={showDeleteWorkspaceDialog}
						onDialogOpenChange={setShowDeleteWorkspaceDialog}
						onConfirm={handleDeleteWorkspace}
						confirmDisabled={isDeletingWorkspace}
						buttonDisabled={isDeletingWorkspace || !canDeleteData}
						dialogDescription="This action cannot be undone. The current workspace and its notes and chats will be permanently deleted."
					/>
				</Field>
				<Field>
					<Label className={SETTINGS_LABEL_CLASSNAME}>Account</Label>
					<DataControlAction
						title="Delete account"
						buttonLabel={isDeletingAccount ? "Deleting..." : "Delete"}
						dialogOpen={showDeleteAccountDialog}
						onDialogOpenChange={(open) => {
							setState((currentState) => ({
								...currentState,
								showDeleteAccountDialog: open,
							}));
						}}
						onConfirm={handleDeleteAccount}
						confirmDisabled={isDeletingAccount}
						buttonDisabled={isDeletingAccount || !canDeleteData}
						dialogDescription="This action cannot be undone. Your account will be permanently deleted, and OpenGran will remove your notes from the backend."
					/>
				</Field>
			</FieldGroup>
		</div>
	);
}

function DataControlAction({
	title,
	buttonLabel,
	dialogOpen,
	onDialogOpenChange,
	onConfirm,
	confirmDisabled,
	buttonDisabled,
	dialogDescription,
}: {
	title: string;
	buttonLabel: string;
	dialogOpen: boolean;
	onDialogOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	confirmDisabled: boolean;
	buttonDisabled: boolean;
	dialogDescription: string;
}) {
	return (
		<div className="flex items-center justify-between gap-4">
			<div className="text-sm font-medium">{title}</div>
			<AlertDialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
				<AlertDialogTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="shrink-0 text-destructive hover:bg-destructive/10 hover:text-destructive focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:hover:bg-destructive/20"
						disabled={buttonDisabled}
					>
						{buttonLabel}
					</Button>
				</AlertDialogTrigger>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
						<AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel disabled={confirmDisabled}>
							Cancel
						</AlertDialogCancel>
						<AlertDialogAction
							className="bg-destructive/15 text-destructive hover:bg-destructive/20 hover:text-destructive dark:text-red-500 dark:hover:bg-destructive/25"
							onClick={onConfirm}
							disabled={confirmDisabled}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function ManageAccountForm({
	user,
	onCancel,
	onSave,
}: {
	user: SettingsUser;
	onCancel: () => void;
	onSave: (user: SettingsUser) => void;
}) {
	const [formState, setFormState] = useState(() => ({
		name: user.name,
		avatar: user.avatar,
		avatarPreview: user.avatar,
	}));
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setFormState({
			name: user.name,
			avatar: user.avatar,
			avatarPreview: user.avatar,
		});
	}, [user]);

	const initials = getInitials(formState.name, user.email);
	const avatarSrc = getAvatarSrc({
		avatar: formState.avatarPreview,
		name: formState.name,
		email: user.email,
	});

	return (
		<div className="py-4">
			<FieldGroup className="gap-6">
				<Field>
					<Label className={SETTINGS_LABEL_CLASSNAME}>Avatar</Label>
					<div className="flex items-center gap-4">
						<Avatar className="size-20 rounded-lg">
							<AvatarImage
								src={avatarSrc}
								alt="Avatar preview"
								className="object-cover"
							/>
							<AvatarFallback className="rounded-lg bg-muted/40">
								{formState.avatarPreview ? (
									initials
								) : (
									<ImageUp className="size-8" />
								)}
							</AvatarFallback>
						</Avatar>
						<div className="flex flex-col gap-2">
							<Button
								variant="outline"
								size="sm"
								className="w-min"
								onClick={() => fileInputRef.current?.click()}
							>
								Upload
							</Button>
							<input
								ref={fileInputRef}
								type="file"
								accept="image/png,image/jpeg,image/gif,image/webp"
								className="hidden"
								onChange={(event) => {
									const file = event.target.files?.[0];
									if (!file) {
										return;
									}

									const objectUrl = URL.createObjectURL(file);
									setFormState((current) => ({
										...current,
										avatar: objectUrl,
										avatarPreview: objectUrl,
									}));
								}}
							/>
							<FieldDescription>
								Recommend size 1:1, up to 5MB.
							</FieldDescription>
						</div>
					</div>
				</Field>
				<Field>
					<Label htmlFor="settings-name" className={SETTINGS_LABEL_CLASSNAME}>
						Full name
					</Label>
					<Input
						id="settings-name"
						value={formState.name}
						onChange={(event) => {
							const nextName = event.target.value;
							setFormState((current) => ({
								...current,
								name: nextName,
							}));
						}}
						placeholder="Enter your name"
					/>
				</Field>
				<Field>
					<Label htmlFor="settings-email" className={SETTINGS_LABEL_CLASSNAME}>
						Email
					</Label>
					<Input id="settings-email" value={user.email} disabled />
				</Field>
			</FieldGroup>
			<div className="flex justify-end gap-2 pt-6">
				<Button variant="ghost" onClick={onCancel}>
					Cancel
				</Button>
				<Button
					onClick={() =>
						onSave({
							name: formState.name.trim() || user.name,
							email: user.email,
							avatar: formState.avatar,
						})
					}
					disabled={!formState.name.trim()}
				>
					Save
				</Button>
			</div>
		</div>
	);
}

function getInitials(name: string, email: string) {
	const source = name.trim() || email;

	return source
		.split(" ")
		.map((part) => part[0])
		.join("")
		.slice(0, 2)
		.toUpperCase();
}
