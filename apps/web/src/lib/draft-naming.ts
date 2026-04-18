const normalizeName = (value: string) => value.trim().toLowerCase();

const slugify = (value: string) =>
	value
		.toLowerCase()
		.trim()
		.replace(/['’]/g, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");

export const createUniqueDraftName = (
	baseName: string,
	existingNames: string[],
) => {
	const existing = new Set(existingNames.map(normalizeName));
	const trimmedBaseName = baseName.trim();

	if (!existing.has(normalizeName(trimmedBaseName))) {
		return trimmedBaseName;
	}

	let suffix = 2;
	while (existing.has(normalizeName(`${trimmedBaseName} ${suffix}`))) {
		suffix += 1;
	}

	return `${trimmedBaseName} ${suffix}`;
};

export const createUniqueDraftSlug = ({
	baseName,
	existingSlugs,
	fallbackPrefix,
}: {
	baseName: string;
	existingSlugs: string[];
	fallbackPrefix: string;
}) => {
	const existing = new Set(existingSlugs);
	const normalizedBaseSlug = slugify(baseName) || fallbackPrefix;

	if (!existing.has(normalizedBaseSlug)) {
		return normalizedBaseSlug;
	}

	let suffix = 2;
	while (existing.has(`${normalizedBaseSlug}-${suffix}`)) {
		suffix += 1;
	}

	return `${normalizedBaseSlug}-${suffix}`;
};
