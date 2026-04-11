import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "@workspace/ui/components/field";
import { Input } from "@workspace/ui/components/input";
import { cn } from "@workspace/ui/lib/utils";

type ProjectComposerProps = {
	name: string;
	onNameChange: (value: string) => void;
	error?: string | null;
	nameInputId?: string;
	className?: string;
};

export function ProjectComposer({
	name,
	onNameChange,
	error = null,
	nameInputId = "project-name",
	className,
}: ProjectComposerProps) {
	return (
		<div className={cn("flex flex-col gap-4", className)}>
			<FieldGroup>
				<Field data-invalid={error ? true : undefined}>
					<FieldLabel htmlFor={nameInputId}>Project name</FieldLabel>
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
