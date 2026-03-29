/// <reference types="vite/client" />
/// <reference path="./electron.d.ts" />
/// <reference path="./canvas-confetti.d.ts" />

interface ImportMetaEnv {
	readonly VITE_CONVEX_URL?: string;
	readonly VITE_CONVEX_SITE_URL?: string;
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
