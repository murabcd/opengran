import { cn } from "@workspace/ui/lib/utils";
import { Streamdown, type StreamdownProps } from "streamdown";

const CODE_FENCE_LANGUAGES = new Set([
	"bash",
	"diff",
	"html",
	"js",
	"json",
	"jsx",
	"md",
	"markdown",
	"sh",
	"shell",
	"text",
	"ts",
	"tsx",
	"yml",
	"yaml",
]);

const fixNumberedListBreaks = (text: string) =>
	text.replace(/^(\d+)\.\s*\n+\s*\n*/gm, "$1. ");

const normalizeCodeFenceLanguages = (text: string) =>
	text.replace(/```([^\n]*)/g, (_match, languageRaw) => {
		const language = String(languageRaw || "")
			.trim()
			.toLowerCase();

		if (!language) {
			return "```";
		}

		const normalizedLanguage = language.split(/\s+/)[0];
		return CODE_FENCE_LANGUAGES.has(normalizedLanguage)
			? `\`\`\`${normalizedLanguage}`
			: "```text";
	});

const normalizeMarkdownForStreamdown = (content: string) =>
	normalizeCodeFenceLanguages(fixNumberedListBreaks(content));

type MarkdownStreamProps = Omit<StreamdownProps, "children" | "shikiTheme"> & {
	children: string;
};

export function MarkdownStream({
	children,
	className,
	controls = false,
	caret = "block",
	mode,
	...props
}: MarkdownStreamProps) {
	return (
		<Streamdown
			className={cn("wrap-break-word", className)}
			controls={controls}
			caret={caret}
			mode={mode}
			shikiTheme={["github-light", "github-dark"]}
			{...props}
		>
			{normalizeMarkdownForStreamdown(children)}
		</Streamdown>
	);
}
