import { openai } from "@ai-sdk/openai";
import { generateImage, tool } from "ai";
import { z } from "zod";
import { withToolTiming } from "./tool-timing.mjs";

const IMAGE_GENERATION_MODEL_ID = "gpt-image-2";
const GENERATED_IMAGE_MEDIA_TYPE = "image/png";

const createGeneratedImageFilename = () =>
	`generated-image-${new Date().toISOString().replace(/[:.]/g, "-")}.png`;

const toBlobPart = (bytes) =>
	bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);

export const buildImageGenerationInstruction = () =>
	"When the user asks you to create or generate an image, use the generate_image tool. The generated file is saved as an artifact; after using the tool, briefly confirm what was created without embedding the image in markdown.";

export const createConvexGeneratedImageUploader =
	({ chatAttachmentsApi, client }) =>
	async (image) => {
		const uploadUrl = await client.mutation(
			chatAttachmentsApi.generateUploadUrl,
		);
		const uploadResponse = await fetch(uploadUrl, {
			method: "POST",
			headers: { "Content-Type": GENERATED_IMAGE_MEDIA_TYPE },
			body: new Blob([toBlobPart(image)], {
				type: GENERATED_IMAGE_MEDIA_TYPE,
			}),
		});

		if (!uploadResponse.ok) {
			throw new Error("Generated image upload failed.");
		}

		const result = await uploadResponse.json();
		if (!result.storageId) {
			throw new Error("Generated image upload did not return a storage id.");
		}

		const url = await client.mutation(chatAttachmentsApi.getUrl, {
			storageId: result.storageId,
		});

		if (!url) {
			throw new Error("Generated image upload did not return a file URL.");
		}

		return {
			filename: createGeneratedImageFilename(),
			mediaType: GENERATED_IMAGE_MEDIA_TYPE,
			providerMetadata: {
				opengran: {
					generatedBy: "ai",
					storageId: result.storageId,
				},
			},
			url,
		};
	};

export const createImageGenerationTool = ({ uploadGeneratedImage }) =>
	tool({
		description:
			"Generate an image artifact from a text prompt. Use this when the user asks to create, generate, draw, render, or make an image.",
		inputSchema: z.object({
			prompt: z
				.string()
				.min(1)
				.describe("The detailed prompt for the image to generate."),
		}),
		execute: async ({ prompt }) =>
			await withToolTiming(async () => {
				const { image } = await generateImage({
					model: openai.image(IMAGE_GENERATION_MODEL_ID),
					prompt,
				});

				return await uploadGeneratedImage(image.uint8Array);
			}),
	});
