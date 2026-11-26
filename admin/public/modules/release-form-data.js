import { UNKNOWN_RELEASE_DATE } from "./release-date.js";

export function readReleaseFormData(form) {
	const data = new FormData(form);
	const platforms = data.getAll("platform");

	return {
		platforms,
		input: {
			title: String(data.get("title") ?? "").trim(),
			platform: platforms.join(","),
			release_date: form.elements.release_date_unknown.checked ? UNKNOWN_RELEASE_DATE : data.get("release_date"),
		},
	};
}
