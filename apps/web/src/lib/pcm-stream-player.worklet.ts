declare abstract class AudioWorkletProcessor {
	protected constructor();
	readonly port: MessagePort;
	process(
		inputs: Float32Array[][],
		outputs: Float32Array[][],
		parameters: Record<string, Float32Array>,
	): boolean;
}

declare function registerProcessor(
	name: string,
	processorCtor: typeof AudioWorkletProcessor,
): void;

type ProcessorMessageEvent = MessageEvent<{
	samples?: Float32Array;
	type?: "push" | "reset";
}>;

class PcmStreamPlayerProcessor extends AudioWorkletProcessor {
	private activeChunk: Float32Array | null = null;
	private activeOffset = 0;
	private readonly queue: Float32Array[] = [];

	constructor() {
		super();

		this.port.onmessage = (event: ProcessorMessageEvent) => {
			if (event.data?.type === "push" && event.data.samples) {
				this.queue.push(event.data.samples);
				return;
			}

			if (event.data?.type === "reset") {
				this.queue.length = 0;
				this.activeChunk = null;
				this.activeOffset = 0;
			}
		};
	}

	process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
		const outputChannels = outputs[0];
		if (!outputChannels?.length) {
			return true;
		}

		const primaryChannel = outputChannels[0];
		primaryChannel.fill(0);

		let writeOffset = 0;
		while (writeOffset < primaryChannel.length) {
			if (!this.activeChunk || this.activeOffset >= this.activeChunk.length) {
				this.activeChunk = this.queue.shift() ?? null;
				this.activeOffset = 0;

				if (!this.activeChunk) {
					break;
				}
			}

			const remainingSamples = this.activeChunk.length - this.activeOffset;
			const copyLength = Math.min(
				primaryChannel.length - writeOffset,
				remainingSamples,
			);

			primaryChannel.set(
				this.activeChunk.subarray(
					this.activeOffset,
					this.activeOffset + copyLength,
				),
				writeOffset,
			);
			writeOffset += copyLength;
			this.activeOffset += copyLength;
		}

		for (
			let channelIndex = 1;
			channelIndex < outputChannels.length;
			channelIndex += 1
		) {
			outputChannels[channelIndex].set(primaryChannel);
		}

		return true;
	}
}

registerProcessor("pcm-stream-player", PcmStreamPlayerProcessor);
