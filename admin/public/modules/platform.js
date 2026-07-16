const PLATFORM_THEMES = {
	NS: "nintendo",
	NS2: "nintendo",
	PS4: "playstation",
	PS5: "playstation",
	Steam: "steam",
	XBOX: "xbox",
};

export function getPlatformTheme(platform) {
	return PLATFORM_THEMES[platform] ?? "default";
}

export function parsePlatforms(platforms) {
	return String(platforms ?? "")
		.split(",")
		.map((platform) => platform.trim())
		.filter(Boolean);
}

export function focusFirstPlatformOption(form) {
	form.querySelector('input[name="platform"]').focus();
}
