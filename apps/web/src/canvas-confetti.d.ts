declare module "canvas-confetti" {
	type ConfettiOrigin = {
		x?: number;
		y?: number;
	};

	type ConfettiOptions = {
		angle?: number;
		colors?: string[];
		disableForReducedMotion?: boolean;
		gravity?: number;
		origin?: ConfettiOrigin;
		particleCount?: number;
		scalar?: number;
		spread?: number;
		startVelocity?: number;
	};

	type CreateOptions = {
		resize?: boolean;
		useWorker?: boolean;
	};

	type ConfettiInstance = {
		(options?: ConfettiOptions): Promise<null> | null;
		reset: () => void;
	};

	type ConfettiModule = {
		(options?: ConfettiOptions): Promise<null> | null;
		create: (
			canvas?: HTMLCanvasElement | null,
			options?: CreateOptions,
		) => ConfettiInstance;
		reset: () => void;
	};

	const confetti: ConfettiModule;

	export default confetti;
}
