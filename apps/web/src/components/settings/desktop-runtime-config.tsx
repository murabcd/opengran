import { Button } from "@workspace/ui/components/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@workspace/ui/components/card";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
	FieldTitle,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import type { AppRuntimeConfig } from "@/lib/runtime-config";

type DesktopRuntimeConfigFormProps = {
	initialConfig?: AppRuntimeConfig;
	mode?: "settings" | "setup";
	onConfigured?: () => void;
};

type FormValues = {
	openAIApiKey: string;
};

const emptyFormValues: FormValues = {
	openAIApiKey: "",
};

const toFormValues = (): FormValues => ({
	openAIApiKey: "",
});

export function DesktopRuntimeConfigForm({
	initialConfig,
	mode = "settings",
	onConfigured,
}: DesktopRuntimeConfigFormProps) {
	const [config, setConfig] = useState<AppRuntimeConfig | null>(
		initialConfig ?? null,
	);
	const [formValues, setFormValues] = useState<FormValues>(
		initialConfig ? toFormValues() : emptyFormValues,
	);
	const [isLoading, setIsLoading] = useState(!initialConfig);
	const [isSaving, setIsSaving] = useState(false);

	useEffect(() => {
		if (!initialConfig) {
			return;
		}

		setConfig(initialConfig);
		setFormValues(toFormValues());
		setIsLoading(false);
	}, [initialConfig]);

	useEffect(() => {
		if (initialConfig || !window.openGranDesktop?.getRuntimeConfig) {
			setIsLoading(false);
			return;
		}

		let cancelled = false;

		const loadConfig = async () => {
			setIsLoading(true);

			try {
				const nextConfig = await window.openGranDesktop?.getRuntimeConfig();

				if (!nextConfig || cancelled) {
					return;
				}

				setConfig({ ...nextConfig, isDesktop: true });
				setFormValues(toFormValues());
			} catch (error) {
				console.error("Failed to load desktop runtime config", error);
				if (!cancelled) {
					toast.error("Failed to load desktop configuration");
				}
			} finally {
				if (!cancelled) {
					setIsLoading(false);
				}
			}
		};

		void loadConfig();

		return () => {
			cancelled = true;
		};
	}, [initialConfig]);

	const handleSave = async () => {
		if (!window.openGranDesktop?.saveRuntimeConfig) {
			toast.error("Desktop configuration is only available in the desktop app");
			return;
		}

		setIsSaving(true);

		try {
			const nextConfig = await window.openGranDesktop.saveRuntimeConfig({
				openAIApiKey: formValues.openAIApiKey,
			});

			setConfig({ ...nextConfig, isDesktop: true });
			setFormValues(toFormValues());
			toast.success(
				mode === "setup"
					? "Desktop configuration saved"
					: "Desktop configuration updated",
			);
			onConfigured?.();
		} catch (error) {
			console.error("Failed to save desktop runtime config", error);
			toast.error(
				error instanceof Error
					? error.message
					: "Failed to save desktop configuration",
			);
		} finally {
			setIsSaving(false);
		}
	};

	const requiresOpenAIApiKey = !config?.hasOpenAIApiKey;
	const saveDisabled =
		(requiresOpenAIApiKey && !formValues.openAIApiKey.trim()) || isSaving;

	if (!window.openGranDesktop && mode === "settings") {
		return null;
	}

	return (
		<div className="space-y-4">
			{mode === "settings" ? (
				<div className="space-y-1">
					<h2 className="text-lg font-semibold">Desktop configuration</h2>
					<p className="text-muted-foreground text-sm">
						Configure the desktop app without relying on a local `.env` file.
					</p>
				</div>
			) : null}
			<FieldGroup>
				<Field>
					<FieldTitle>OpenAI</FieldTitle>
					<FieldDescription>
						This key is stored only on this device for the desktop app.
					</FieldDescription>
				</Field>
				<Field>
					<FieldLabel htmlFor={`desktop-openai-api-key-${mode}`}>
						OpenAI API key
					</FieldLabel>
					<Input
						id={`desktop-openai-api-key-${mode}`}
						type="password"
						value={formValues.openAIApiKey}
						onChange={(event) =>
							setFormValues((currentValues) => ({
								...currentValues,
								openAIApiKey: event.target.value,
							}))
						}
						placeholder={
							config?.hasOpenAIApiKey
								? "Saved. Enter a new key to replace it."
								: "sk-..."
						}
						disabled={isLoading || isSaving}
					/>
					<FieldDescription>
						{config?.hasOpenAIApiKey
							? "A key is already saved on this device. Leave this blank to keep it."
							: "Required for desktop chat and note AI features."}
					</FieldDescription>
				</Field>
			</FieldGroup>
			<div className="flex items-center justify-between gap-3">
				<p className="text-muted-foreground text-sm">
					{config?.isConfigured
						? "Desktop API key is saved."
						: "Add your OpenAI API key once and the desktop app can run without repo env files."}
				</p>
				<Button onClick={handleSave} disabled={saveDisabled}>
					{isSaving ? <LoaderCircle className="animate-spin" /> : null}
					{mode === "setup" ? "Save and continue" : "Save desktop config"}
				</Button>
			</div>
		</div>
	);
}

export function DesktopSetupScreen({
	initialConfig,
	onConfigured,
}: {
	initialConfig: AppRuntimeConfig;
	onConfigured: () => void;
}) {
	return (
		<main className="from-background via-background to-muted/40 flex min-h-screen items-center justify-center bg-linear-to-b px-6 py-12">
			<Card className="w-full max-w-2xl border-border/60 shadow-lg">
				<CardHeader>
					<CardTitle>Finish desktop setup</CardTitle>
					<CardDescription>
						OpenGran is already pointed at your production backend. Add your
						OpenAI API key so desktop AI features can run.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<DesktopRuntimeConfigForm
						initialConfig={initialConfig}
						mode="setup"
						onConfigured={onConfigured}
					/>
				</CardContent>
			</Card>
		</main>
	);
}
