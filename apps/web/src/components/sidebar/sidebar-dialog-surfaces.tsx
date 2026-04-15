import * as React from "react";

const loadSidebarSearchCommandSurface = () =>
	import("@/components/search/search-command").then((module) => ({
		default: module.SearchCommand,
	}));

let sidebarSearchCommandSurfacePromise: ReturnType<
	typeof loadSidebarSearchCommandSurface
> | null = null;

const preloadSidebarSearchCommandSurface = () => {
	sidebarSearchCommandSurfacePromise ??= loadSidebarSearchCommandSurface();
	return sidebarSearchCommandSurfacePromise;
};

export const SidebarSearchCommandSurface = React.lazy(
	preloadSidebarSearchCommandSurface,
);

const loadSidebarSettingsDialogSurface = () =>
	import("@/components/settings/settings-dialog").then((module) => ({
		default: module.SettingsDialog,
	}));

let sidebarSettingsDialogSurfacePromise: ReturnType<
	typeof loadSidebarSettingsDialogSurface
> | null = null;

const preloadSidebarSettingsDialogSurface = () => {
	sidebarSettingsDialogSurfacePromise ??= loadSidebarSettingsDialogSurface();
	return sidebarSettingsDialogSurfacePromise;
};

export const SidebarSettingsDialogSurface = React.lazy(
	preloadSidebarSettingsDialogSurface,
);

const loadSidebarRecipesDialogSurface = () =>
	import("@/components/recipes/recipes-dialog").then((module) => ({
		default: module.RecipesDialog,
	}));

let sidebarRecipesDialogSurfacePromise: ReturnType<
	typeof loadSidebarRecipesDialogSurface
> | null = null;

const preloadSidebarRecipesDialogSurface = () => {
	sidebarRecipesDialogSurfacePromise ??= loadSidebarRecipesDialogSurface();
	return sidebarRecipesDialogSurfacePromise;
};

export const SidebarRecipesDialogSurface = React.lazy(
	preloadSidebarRecipesDialogSurface,
);

const loadSidebarTemplatesDialogSurface = () =>
	import("@/components/templates/templates-dialog").then((module) => ({
		default: module.TemplatesDialog,
	}));

let sidebarTemplatesDialogSurfacePromise: ReturnType<
	typeof loadSidebarTemplatesDialogSurface
> | null = null;

const preloadSidebarTemplatesDialogSurface = () => {
	sidebarTemplatesDialogSurfacePromise ??= loadSidebarTemplatesDialogSurface();
	return sidebarTemplatesDialogSurfacePromise;
};

export const SidebarTemplatesDialogSurface = React.lazy(
	preloadSidebarTemplatesDialogSurface,
);

const SIDEBAR_DIALOG_SURFACE_PRELOADERS = {
	search: preloadSidebarSearchCommandSurface,
	settings: preloadSidebarSettingsDialogSurface,
	recipes: preloadSidebarRecipesDialogSurface,
	templates: preloadSidebarTemplatesDialogSurface,
} as const;

export type SidebarDialogSurface =
	keyof typeof SIDEBAR_DIALOG_SURFACE_PRELOADERS;

export const SIDEBAR_DIALOG_SURFACES = Object.keys(
	SIDEBAR_DIALOG_SURFACE_PRELOADERS,
) as SidebarDialogSurface[];

export const preloadSidebarDialogSurface = (surface: SidebarDialogSurface) =>
	SIDEBAR_DIALOG_SURFACE_PRELOADERS[surface]();
