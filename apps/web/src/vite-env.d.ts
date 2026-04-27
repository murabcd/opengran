/// <reference types="vite/client" />

import "./canvas-confetti";
import "./electron";

declare global {
	interface ImportMetaEnv {
		readonly VITE_CONVEX_URL?: string;
		readonly VITE_CONVEX_SITE_URL?: string;
	}

	interface ImportMeta {
		readonly env: ImportMetaEnv;
	}
}
