type DesktopSystemAudioStream = {
	dispose: () => Promise<void>;
	stream: MediaStream;
};

const decodePcm16Base64 = (base64Value: string) => {
	const binaryValue = atob(base64Value);
	const buffer = new ArrayBuffer(binaryValue.length);
	const bytes = new Uint8Array(buffer);

	for (let index = 0; index < binaryValue.length; index += 1) {
		bytes[index] = binaryValue.charCodeAt(index);
	}

	const pcm16 = new Int16Array(buffer);
	const float32 = new Float32Array(pcm16.length);

	for (let index = 0; index < pcm16.length; index += 1) {
		float32[index] = pcm16[index] / 32768;
	}

	return float32;
};

export const createDesktopSystemAudioStream =
	async (): Promise<DesktopSystemAudioStream> => {
		if (
			typeof window === "undefined" ||
			!window.openGranDesktop?.startSystemAudioCapture ||
			!window.openGranDesktop?.onSystemAudioCaptureEvent
		) {
			throw new Error("Desktop system audio capture is unavailable.");
		}

		const { sampleRate } =
			await window.openGranDesktop.startSystemAudioCapture();
		const audioContext = new AudioContext({
			latencyHint: "interactive",
			sampleRate,
		});

		try {
			const streamDestination = audioContext.createMediaStreamDestination();
			const track = streamDestination.stream.getAudioTracks()[0];

			if (!track) {
				throw new Error("Desktop system audio track could not be created.");
			}

			await audioContext.resume();

			let hasDisposed = false;
			let nextPlaybackTime = audioContext.currentTime + 0.02;
			const activeSources = new Set<AudioBufferSourceNode>();

			const scheduleChunkPlayback = (samples: Float32Array) => {
				if (samples.length === 0 || hasDisposed) {
					return;
				}

				const buffer = audioContext.createBuffer(1, samples.length, sampleRate);
				buffer.copyToChannel(samples, 0);

				const sourceNode = audioContext.createBufferSource();
				sourceNode.buffer = buffer;
				sourceNode.connect(streamDestination);

				const scheduledStartTime = Math.max(
					nextPlaybackTime,
					audioContext.currentTime + 0.01,
				);
				sourceNode.start(scheduledStartTime);
				nextPlaybackTime = scheduledStartTime + buffer.duration;
				activeSources.add(sourceNode);

				sourceNode.addEventListener("ended", () => {
					activeSources.delete(sourceNode);
					sourceNode.disconnect();
				});
			};

			const unsubscribe = window.openGranDesktop.onSystemAudioCaptureEvent(
				(event) => {
					if (hasDisposed) {
						return;
					}

					if (event.type === "chunk" && event.pcm16) {
						scheduleChunkPlayback(decodePcm16Base64(event.pcm16));
						return;
					}

					if (event.type === "error" || event.type === "stopped") {
						void dispose();
					}
				},
			);

			const dispose = async () => {
				if (hasDisposed) {
					return;
				}

				hasDisposed = true;
				unsubscribe();

				for (const sourceNode of activeSources) {
					try {
						sourceNode.stop();
					} catch {}
					sourceNode.disconnect();
				}

				activeSources.clear();
				track.stop();
				await Promise.allSettled([
					audioContext.close(),
					window.openGranDesktop?.stopSystemAudioCapture?.(),
				]);
			};

			track.addEventListener("ended", () => {
				void dispose();
			});

			return {
				dispose,
				stream: new MediaStream([track]),
			};
		} catch (error) {
			await Promise.allSettled([
				audioContext.close(),
				window.openGranDesktop.stopSystemAudioCapture(),
			]);
			throw error;
		}
	};
