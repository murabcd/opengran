import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@workspace/ui/components/select";
import type { ChatModel } from "@/lib/ai/models";

interface ModelPickerProps {
	selectedModel: ChatModel;
	setSelectedModel: (model: ChatModel) => void;
	models: ChatModel[];
}

export function ModelPicker({
	selectedModel,
	setSelectedModel,
	models,
}: ModelPickerProps) {
	return (
		<Select
			value={selectedModel.id}
			onValueChange={(value) => {
				const nextModel = models.find((model) => model.id === value);

				if (nextModel) {
					setSelectedModel(nextModel);
				}
			}}
		>
			<SelectTrigger>
				<SelectValue placeholder="Select a model" />
			</SelectTrigger>
			<SelectContent side="top" align="start">
				<SelectGroup>
					{models.map((model) => (
						<SelectItem key={model.id} value={model.id}>
							{model.name}
						</SelectItem>
					))}
				</SelectGroup>
			</SelectContent>
		</Select>
	);
}
