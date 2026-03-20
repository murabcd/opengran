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
import { ImageUp, UserRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";

type SettingsUser = {
	name: string;
	email: string;
	avatar: string;
};

type SettingsDialogProps = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	user: SettingsUser;
	onUserChange: (user: SettingsUser) => void;
};

const settingsNav = [{ name: "Profile", icon: UserRound }] as const;

export function SettingsDialog({
	open,
	onOpenChange,
	user,
	onUserChange,
}: SettingsDialogProps) {
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
												<SidebarMenuButton asChild isActive>
													<button type="button">
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
											<BreadcrumbPage>Profile</BreadcrumbPage>
										</BreadcrumbItem>
									</BreadcrumbList>
								</Breadcrumb>
								<div className="md:hidden">
									<Button variant="secondary" size="sm">
										<UserRound />
										Profile
									</Button>
								</div>
							</div>
						</header>
						<div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 pt-0">
							<ManageAccountForm
								user={user}
								onCancel={() => onOpenChange(false)}
								onSave={(nextUser) => {
									onUserChange(nextUser);
									onOpenChange(false);
								}}
							/>
						</div>
					</main>
				</SidebarProvider>
			</DialogContent>
		</Dialog>
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
