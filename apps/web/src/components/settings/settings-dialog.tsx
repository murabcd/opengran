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
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldTitle,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
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
import { useMutation } from "convex/react";
import { Database, ImageUp, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { authClient } from "@/lib/auth-client";
import { api } from "../../../../../convex/_generated/api";

type SettingsUser = {
	name: string;
	email: string;
	avatar: string;
};

type SettingsPage = "Profile" | "Data controls";

type SettingsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	user: SettingsUser;
	onUserChange: (user: SettingsUser) => void;
};

const settingsNav = [
	{ name: "Profile", icon: UserRound },
	{ name: "Data controls", icon: Database },
] as const;

export function SettingsDialog({
	open,
	onOpenChange,
	user,
	onUserChange,
}: SettingsDialogProps) {
	const [activePage, setActivePage] = useState<SettingsPage>("Profile");
	const { data: session } = authClient.useSession();

	useEffect(() => {
		if (open) {
			setActivePage("Profile");
		}
	}, [open]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
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
														onClick={() => setActivePage(item.name)}
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
						<header className="flex h-16 shrink-0 items-center gap-2 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-12">
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
								<div className="flex gap-2 md:hidden">
									{settingsNav.map((item) => (
										<Button
											key={item.name}
											variant={activePage === item.name ? "secondary" : "ghost"}
											size="sm"
											onClick={() => setActivePage(item.name)}
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
							) : (
								<DataControlsSettings
									canDeleteData={Boolean(session?.user)}
									onClose={() => onOpenChange(false)}
								/>
							)}
						</div>
					</main>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
	);
}

function DataControlsSettings({
	canDeleteData,
	onClose,
}: {
	canDeleteData: boolean;
	onClose: () => void;
}) {
	const [showDeleteAccountDialog, setShowDeleteAccountDialog] = useState(false);
	const [isDeletingAccount, setIsDeletingAccount] = useState(false);
	const [showDeleteAllNotesDialog, setShowDeleteAllNotesDialog] =
		useState(false);
	const [isDeletingAllNotes, setIsDeletingAllNotes] = useState(false);
	const removeAllNotes = useMutation(api.quickNotes.removeAll);

	const navigateTo = (pathname: string) => {
		window.history.pushState(null, "", pathname);
		window.dispatchEvent(new PopStateEvent("popstate"));
	};

	const handleDeleteAccount = async () => {
		setIsDeletingAccount(true);

		try {
			await authClient.$fetch("/delete-user", {
				method: "POST",
				body: { callbackURL: "/" },
			});
			setShowDeleteAccountDialog(false);
			onClose();
			window.location.assign("/");
		} catch (error) {
			console.error("Failed to delete account", error);
			setShowDeleteAccountDialog(false);
			toast.error("Failed to delete account");
		} finally {
			setIsDeletingAccount(false);
		}
	};

	const handleDeleteAllNotes = async () => {
		setIsDeletingAllNotes(true);

		try {
			const result = await removeAllNotes({});
			setShowDeleteAllNotesDialog(false);
			onClose();
			navigateTo("/home");
			toast.success(
				result.hasMore ? "Note deletion started" : "All notes deleted",
			);
		} catch (error) {
			console.error("Failed to delete all notes", error);
			setShowDeleteAllNotesDialog(false);
			toast.error("Failed to delete all notes");
		} finally {
			setIsDeletingAllNotes(false);
		}
	};

	return (
		<div className="py-4">
			<FieldGroup className="gap-6">
				<Field>
					<FieldTitle>Data controls</FieldTitle>
					<FieldDescription>
						Permanently remove your OpenGran account or wipe every quick note
						you own.
					</FieldDescription>
				</Field>
				<DataControlAction
					title="Delete account"
					description="Permanently delete your account and all of your notes."
					buttonLabel={isDeletingAccount ? "Deleting..." : "Delete"}
					dialogOpen={showDeleteAccountDialog}
					onDialogOpenChange={setShowDeleteAccountDialog}
					onConfirm={handleDeleteAccount}
					confirmDisabled={isDeletingAccount}
					buttonDisabled={isDeletingAccount || !canDeleteData}
					dialogDescription="This action cannot be undone. Your account will be permanently deleted, and OpenGran will remove your notes from the backend."
				/>
				<DataControlAction
					title="Delete all notes"
					description="Permanently delete every quick note you own, including archived and shared notes."
					buttonLabel={isDeletingAllNotes ? "Deleting..." : "Delete"}
					dialogOpen={showDeleteAllNotesDialog}
					onDialogOpenChange={setShowDeleteAllNotesDialog}
					onConfirm={handleDeleteAllNotes}
					confirmDisabled={isDeletingAllNotes}
					buttonDisabled={isDeletingAllNotes || !canDeleteData}
					dialogDescription="This action cannot be undone. All quick notes you own will be permanently deleted."
				/>
			</FieldGroup>
		</div>
	);
}

function DataControlAction({
	title,
	description,
	buttonLabel,
	dialogOpen,
	onDialogOpenChange,
	onConfirm,
	confirmDisabled,
	buttonDisabled,
	dialogDescription,
}: {
	title: string;
	description: string;
	buttonLabel: string;
	dialogOpen: boolean;
	onDialogOpenChange: (open: boolean) => void;
	onConfirm: () => void;
	confirmDisabled: boolean;
	buttonDisabled: boolean;
	dialogDescription: string;
}) {
	return (
		<div className="flex items-start justify-between gap-4 rounded-lg border p-4">
			<div className="space-y-1">
				<div className="text-sm font-medium">{title}</div>
				<p className="text-sm text-muted-foreground">{description}</p>
			</div>
			<AlertDialog open={dialogOpen} onOpenChange={onDialogOpenChange}>
				<AlertDialogTrigger asChild>
					<Button
						variant="outline"
						size="sm"
						className="shrink-0 text-destructive hover:text-destructive focus:text-destructive dark:text-red-500"
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
	const [name, setName] = useState(user.name);
	const [avatar, setAvatar] = useState(user.avatar);
	const [avatarPreview, setAvatarPreview] = useState(user.avatar);
	const fileInputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setName(user.name);
		setAvatar(user.avatar);
		setAvatarPreview(user.avatar);
	}, [user]);

	const initials = getInitials(name, user.email);

	return (
		<div className="py-4">
			<FieldGroup className="gap-6">
				<Field>
					<FieldTitle>Avatar</FieldTitle>
					<div className="flex items-center gap-4">
						<Avatar className="size-20 rounded-lg">
							{avatarPreview ? (
								<AvatarImage
									src={avatarPreview}
									alt="Avatar preview"
									className="object-cover"
								/>
							) : null}
							<AvatarFallback className="rounded-lg bg-muted/40">
								{avatarPreview ? initials : <ImageUp className="size-8" />}
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
									setAvatar(objectUrl);
									setAvatarPreview(objectUrl);
								}}
							/>
							<FieldDescription>
								Recommend size 1:1, up to 5MB.
							</FieldDescription>
						</div>
					</div>
				</Field>
				<Field>
					<FieldLabel htmlFor="settings-name">Full name</FieldLabel>
					<Input
						id="settings-name"
						value={name}
						onChange={(event) => setName(event.target.value)}
						placeholder="Enter your name"
					/>
				</Field>
				<Field>
					<FieldLabel htmlFor="settings-email">Email</FieldLabel>
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
							name: name.trim() || user.name,
							email: user.email,
							avatar,
						})
					}
					disabled={!name.trim()}
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
