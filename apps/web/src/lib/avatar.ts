type UserAvatarInput = {
	avatar?: string | null;
	name?: string | null;
	email?: string | null;
};

export function getAvatarSrc({ avatar, name, email }: UserAvatarInput) {
	const avatarValue = avatar?.trim();

	if (avatarValue) {
		return avatarValue;
	}

	const seed = (
		email?.trim().toLowerCase() ||
		name?.trim() ||
		"user"
	).replaceAll(/\s+/g, "-");

	return `https://avatar.vercel.sh/${encodeURIComponent(seed)}`;
}
