import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type * as React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ChatPage } from "../src/components/chat/chat-page";

const { sendMessageMock, useChatMock } = vi.hoisted(() => ({
	sendMessageMock: vi.fn(),
	useChatMock: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({
	useChat: useChatMock,
}));

vi.mock("ai", () => ({
	DefaultChatTransport: class DefaultChatTransport {
		constructor(readonly options: unknown) {}
	},
}));

vi.mock("../src/components/chat/messages", () => ({
	ChatMessages: () => <div>chat messages</div>,
}));

vi.mock("@workspace/ui/components/avatar", () => ({
	Avatar: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	AvatarFallback: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
}));

vi.mock("@workspace/ui/components/command", () => ({
	Command: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	CommandEmpty: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	CommandGroup: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	CommandInput: ({
		onValueChange,
		value,
		placeholder,
	}: {
		onValueChange?: (value: string) => void;
		value?: string;
		placeholder?: string;
	}) => (
		<input
			placeholder={placeholder}
			value={value}
			onChange={(event) => onValueChange?.(event.target.value)}
		/>
	),
	CommandItem: ({
		children,
		onSelect,
	}: React.PropsWithChildren<{ onSelect?: () => void }>) => (
		<button type="button" onClick={() => onSelect?.()}>
			{children}
		</button>
	),
	CommandList: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
}));

vi.mock("@workspace/ui/components/dropdown-menu", () => ({
	DropdownMenu: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuCheckboxItem: ({
		children,
		checked,
		onCheckedChange,
	}: React.PropsWithChildren<{
		checked?: boolean;
		onCheckedChange?: (checked: boolean) => void;
	}>) => (
		<button type="button" onClick={() => onCheckedChange?.(!checked)}>
			{children}
		</button>
	),
	DropdownMenuContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuGroup: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuItem: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuLabel: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuSeparator: () => <hr />,
	DropdownMenuSub: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuSubContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	DropdownMenuSubTrigger: ({ children }: React.PropsWithChildren) => (
		<button type="button">{children}</button>
	),
	DropdownMenuTrigger: ({ children }: React.PropsWithChildren) => (
		<>{children}</>
	),
}));

vi.mock("@workspace/ui/components/input-group", () => ({
	InputGroup: ({
		children,
		className,
	}: React.PropsWithChildren<{ className?: string }>) => (
		<div className={className}>{children}</div>
	),
	InputGroupAddon: ({
		children,
		className,
	}: React.PropsWithChildren<{ className?: string }>) => (
		<div className={className}>{children}</div>
	),
	InputGroupButton: ({
		children,
		...props
	}: React.PropsWithChildren<
		React.ButtonHTMLAttributes<HTMLButtonElement> & {
			variant?: string;
			size?: string;
		}
	>) => (
		<button type="button" {...props}>
			{children}
		</button>
	),
	InputGroupTextarea: (
		props: React.TextareaHTMLAttributes<HTMLTextAreaElement>,
	) => <textarea {...props} />,
}));

vi.mock("@workspace/ui/components/popover", () => ({
	Popover: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	PopoverContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	PopoverTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

vi.mock("@workspace/ui/components/switch", () => ({
	Switch: ({
		checked,
		id,
		onCheckedChange,
	}: {
		checked?: boolean;
		id?: string;
		onCheckedChange?: (checked: boolean) => void;
	}) => (
		<input
			id={id}
			type="checkbox"
			checked={checked}
			onChange={(event) => onCheckedChange?.(event.target.checked)}
		/>
	),
}));

vi.mock("@workspace/ui/components/tooltip", () => ({
	Tooltip: ({ children }: React.PropsWithChildren) => <div>{children}</div>,
	TooltipContent: ({ children }: React.PropsWithChildren) => (
		<div>{children}</div>
	),
	TooltipTrigger: ({ children }: React.PropsWithChildren) => <>{children}</>,
}));

describe("ChatPage", () => {
	beforeEach(() => {
		sendMessageMock.mockReset();
		useChatMock.mockReturnValue({
			messages: [],
			sendMessage: sendMessageMock,
			error: undefined,
			status: "ready",
		});
	});

	afterEach(() => {
		cleanup();
	});

	it("submits the selected AI context in the chat request body", async () => {
		const user = userEvent.setup();

		render(<ChatPage />);

		await user.type(
			screen.getByPlaceholderText("Ask, search, or make anything..."),
			"hello",
		);
		await user.click(screen.getByRole("button", { name: "GPT-4.1" }));
		await user.click(screen.getByLabelText("Web Search"));
		await user.click(screen.getByLabelText("Apps and Integrations"));
		await user.click(screen.getByRole("button", { name: /meeting notes/i }));
		await user.click(screen.getByRole("button", { name: /brand guidelines/i }));
		await user.click(screen.getByRole("button", { name: "Send" }));

		expect(sendMessageMock).toHaveBeenCalledTimes(1);
		expect(sendMessageMock).toHaveBeenCalledWith(
			{ text: "hello" },
			{
				body: {
					model: "gpt-4.1",
					webSearchEnabled: true,
					appsEnabled: false,
					mentions: ["meeting-notes"],
					selectedSourceIds: ["guidelines"],
				},
			},
		);
	});
});
