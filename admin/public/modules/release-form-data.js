export function readReleaseFormData(form) {
	const data = new FormData(form);
	const platforms = data.getAll("platform");

	return {
		platforms,
		input: {
			title: String(data.get("title") ?? "").trim(),
			platform: platforms.join(","),
			release_date: data.get("release_date"),
		},
	};
}
