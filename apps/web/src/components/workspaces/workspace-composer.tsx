import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";

type WorkspaceComposerProps = {
	name: string;
	onNameChange: (value: string) => void;
	error?: string | null;
	nameInputId?: string;
	className?: string;
};

export function WorkspaceComposer({
	name,
	onNameChange,
	error = null,
	nameInputId = "workspace-name",
	className,
}: WorkspaceComposerProps) {
	return (
		<div className={cn("flex flex-col gap-4", className)}>
			<FieldGroup>
				<Field data-invalid={error ? true : undefined}>
					<FieldLabel htmlFor={nameInputId}>Workspace name</FieldLabel>
					<Input
						id={nameInputId}
						value={name}
						onChange={(event) => onNameChange(event.target.value)}
						aria-invalid={error ? true : undefined}
						maxLength={48}
					/>
				</Field>
			</FieldGroup>
			{error ? <FieldError>{error}</FieldError> : null}
		</div>
	);
}
