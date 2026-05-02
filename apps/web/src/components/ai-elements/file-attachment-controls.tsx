import { InputGroupButton } from "@workspace/ui/components/input-group";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@workspace/ui/components/tooltip";
import type { FileUIPart } from "ai";
import { useMutation } from "convex/react";
import { Paperclip, X } from "lucide-react";
import * as React from "react";
import { api } from "../../../../../convex/_generated/api";
import type { Id } from "../../../../../convex/_generated/dataModel";

type UploadResult = {
	storageId?: Id<"_storage">;
};

export type ChatAttachment = FileUIPart & {
	id: string;
	localUrl?: string;
	uploadStatus: "uploading" | "ready";
};

export const getReadyFileParts = (
	attachments: ChatAttachment[],
): FileUIPart[] =>
	attachments.flatMap((attachment) =>
		attachment.uploadStatus === "ready"
			? [
					{
						type: "file" as const,
						mediaType: attachment.mediaType,
						filename: attachment.filename,
						url: attachment.url,
						providerMetadata: attachment.providerMetadata,
					},
				]
			: [],
	);

export const hasUploadingAttachments = (attachments: ChatAttachment[]) =>
	attachments.some((attachment) => attachment.uploadStatus === "uploading");

export function useRevokeAttachmentObjectUrls(attachments: ChatAttachment[]) {
	const localUrlByIdRef = React.useRef(new Map<string, string>());

	React.useEffect(() => {
		const nextLocalUrlById = new Map<string, string>();

		for (const attachment of attachments) {
			if (attachment.localUrl) {
				nextLocalUrlById.set(attachment.id, attachment.localUrl);
			}
		}

		for (const [id, localUrl] of localUrlByIdRef.current) {
			if (nextLocalUrlById.get(id) !== localUrl) {
				URL.revokeObjectURL(localUrl);
			}
		}

		localUrlByIdRef.current = nextLocalUrlById;
	}, [attachments]);

	React.useEffect(
		() => () => {
			for (const localUrl of localUrlByIdRef.current.values()) {
				URL.revokeObjectURL(localUrl);
			}
			localUrlByIdRef.current.clear();
		},
		[],
	);
}

function useConvexFileAttachmentUpload() {
	const generateUploadUrl = useMutation(api.chatAttachments.generateUploadUrl);
	const getFileUrl = useMutation(api.chatAttachments.getUrl);

	return React.useCallback(
		async (file: File): Promise<FileUIPart> => {
			const uploadUrl = await generateUploadUrl();
			const response = await fetch(uploadUrl, {
				method: "POST",
				headers: { "Content-Type": file.type },
				body: file,
			});

			if (!response.ok) {
				throw new Error("Attachment upload failed.");
			}

			const result = (await response.json()) as UploadResult;
			if (!result.storageId) {
				throw new Error("Attachment upload did not return a storage id.");
			}

			const url = await getFileUrl({ storageId: result.storageId });
			if (!url) {
				throw new Error("Attachment upload did not return a file URL.");
			}

			return {
				type: "file",
				mediaType: file.type || "application/octet-stream",
				filename: file.name,
				url,
				providerMetadata: {
					opengran: {
						storageId: result.storageId,
					},
				},
			};
		},
		[generateUploadUrl, getFileUrl],
	);
}

export function FileAttachmentButton({
	disabled,
	onFilesAdded,
	onFileUploadFailed,
	onFileUploaded,
}: {
	disabled?: boolean;
	onFilesAdded: (files: ChatAttachment[]) => void;
	onFileUploadFailed: (id: string) => void;
	onFileUploaded: (id: string, file: FileUIPart) => void;
}) {
	const inputRef = React.useRef<HTMLInputElement | null>(null);
	const attachmentIdCounterRef = React.useRef(0);
	const uploadFile = useConvexFileAttachmentUpload();

	return (
		<>
			<input
				ref={inputRef}
				aria-label="Attach files"
				className="hidden"
				multiple
				onChange={(event) => {
					const files = event.currentTarget.files;
					if (!files || files.length === 0) {
						return;
					}

					const selectedFiles = Array.from(files);
					const attachments = selectedFiles.map((file) => {
						const localUrl = URL.createObjectURL(file);
						attachmentIdCounterRef.current += 1;

						return {
							id: [
								file.name,
								file.size,
								file.lastModified,
								attachmentIdCounterRef.current,
							].join(":"),
							type: "file" as const,
							mediaType: file.type || "application/octet-stream",
							filename: file.name,
							url: localUrl,
							localUrl,
							uploadStatus: "uploading" as const,
						};
					});

					onFilesAdded(attachments);

					for (const [index, file] of selectedFiles.entries()) {
						const attachment = attachments[index];
						void uploadFile(file)
							.then((uploadedFile) =>
								onFileUploaded(attachment.id, uploadedFile),
							)
							.catch((error) => {
								console.error("Failed to upload attachment", error);
								onFileUploadFailed(attachment.id);
							});
					}

					if (inputRef.current) {
						inputRef.current.value = "";
					}
				}}
				type="file"
			/>
			<Tooltip>
				<TooltipTrigger asChild>
					<InputGroupButton
						aria-label="Attach files"
						className="shrink-0 rounded-full bg-transparent !text-muted-foreground shadow-none hover:bg-muted hover:!text-foreground"
						disabled={disabled}
						onClick={() => inputRef.current?.click()}
						size="icon-sm"
						type="button"
						variant="ghost"
					>
						<Paperclip className="size-4" />
					</InputGroupButton>
				</TooltipTrigger>
				<TooltipContent>Attach files</TooltipContent>
			</Tooltip>
		</>
	);
}

export function FileAttachmentChips({
	files,
	onRemove,
}: {
	files: ChatAttachment[];
	onRemove: (index: number) => void;
}) {
	if (files.length === 0) {
		return null;
	}

	return (
		<div className="no-scrollbar -m-1.5 flex gap-1 overflow-y-auto p-1.5">
			{files.map((file, index) => (
				<InputGroupButton
					key={file.id}
					className="group/attachment-chip max-w-48 rounded-full pl-2!"
					onClick={() => onRemove(index)}
					size="sm"
					type="button"
					variant="secondary"
				>
					<Paperclip className="size-3.5" />
					<span className="min-w-0 truncate">
						{file.filename || "Attached file"}
					</span>
					<X className="opacity-0 transition-opacity group-hover/attachment-chip:opacity-100 group-focus-visible/attachment-chip:opacity-100" />
				</InputGroupButton>
			))}
		</div>
	);
}
