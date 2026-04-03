const clampPcm16Sample = (value) =>
	Math.max(-32768, Math.min(32767, Math.round(value)));

const decodeBase64Pcm16 = (base64Value) => {
	const buffer = Buffer.from(base64Value, "base64");

	return new Int16Array(
		buffer.buffer,
		buffer.byteOffset,
		Math.floor(buffer.byteLength / Int16Array.BYTES_PER_ELEMENT),
	);
};

const encodeBase64Pcm16 = (pcm16Samples) =>
	Buffer.from(
		pcm16Samples.buffer,
		pcm16Samples.byteOffset,
		pcm16Samples.byteLength,
	).toString("base64");

const createIntegerFactorDownsampler = (factor) => {
	let remainder = new Int16Array(0);

	return (base64Value) => {
		const pcm16 = decodeBase64Pcm16(base64Value);
		const nextInput = new Int16Array(remainder.length + pcm16.length);
		nextInput.set(remainder);
		nextInput.set(pcm16, remainder.length);

		const outputLength = Math.floor(nextInput.length / factor);
		if (outputLength <= 0) {
			remainder = nextInput;
			return "";
		}

		const output = new Int16Array(outputLength);

		for (let index = 0; index < outputLength; index += 1) {
			const start = index * factor;
			let sum = 0;

			for (let offset = 0; offset < factor; offset += 1) {
				sum += nextInput[start + offset];
			}

			output[index] = clampPcm16Sample(sum / factor);
		}

		remainder = nextInput.slice(outputLength * factor);
		return encodeBase64Pcm16(output);
	};
};

const createInterpolatingResampler = ({ inputRate, outputRate }) => {
	let remainder = new Float32Array(0);
	const sampleRatio = inputRate / outputRate;

	return (base64Value) => {
		const pcm16 = decodeBase64Pcm16(base64Value);
		const nextInput = new Float32Array(remainder.length + pcm16.length);
		nextInput.set(remainder);

		for (let index = 0; index < pcm16.length; index += 1) {
			nextInput[remainder.length + index] = pcm16[index] / 32768;
		}

		const outputLength = Math.floor((nextInput.length - 1) / sampleRatio);
		if (outputLength <= 0) {
			remainder = nextInput;
			return "";
		}

		const output = new Int16Array(outputLength);

		for (let index = 0; index < outputLength; index += 1) {
			const position = index * sampleRatio;
			const leftIndex = Math.floor(position);
			const rightIndex = Math.min(leftIndex + 1, nextInput.length - 1);
			const blend = position - leftIndex;
			const sample =
				nextInput[leftIndex] +
				(nextInput[rightIndex] - nextInput[leftIndex]) * blend;

			output[index] = clampPcm16Sample(sample * 32768);
		}

		const consumedSamples = Math.floor(outputLength * sampleRatio);
		remainder = nextInput.slice(Math.max(0, consumedSamples));

		return encodeBase64Pcm16(output);
	};
};

export const createPcm16Resampler = (inputRate, outputRate) => {
	if (
		!Number.isFinite(inputRate) ||
		!Number.isFinite(outputRate) ||
		inputRate <= 0 ||
		outputRate <= 0
	) {
		throw new Error("Audio sample rate is invalid.");
	}

	if (inputRate === outputRate) {
		return (base64Value) => base64Value;
	}

	const exactFactor = inputRate / outputRate;
	if (
		exactFactor > 1 &&
		Number.isInteger(exactFactor) &&
		Number.isSafeInteger(exactFactor)
	) {
		return createIntegerFactorDownsampler(exactFactor);
	}

	return createInterpolatingResampler({
		inputRate,
		outputRate,
	});
};
