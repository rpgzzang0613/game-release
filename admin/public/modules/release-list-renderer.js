import { getPlatformTheme, parsePlatforms } from "./platform.js";
import { setupReleaseDateInput, syncReleaseDateInput, UNKNOWN_RELEASE_DATE } from "./release-date.js";

export function createReleaseElement(template, release) {
	const fragment = template.content.cloneNode(true);
	const item = fragment.querySelector(".release-item");
	const time = fragment.querySelector("time");

	item.dataset.id = release.id;
	time.dateTime = release.release_date;
	time.textContent = release.release_date;
	fragment.querySelector(".release-item__title strong").textContent = release.title;

	const badges = fragment.querySelector(".platform-badges");
	for (const platform of parsePlatforms(release.platform)) {
		const badge = document.createElement("span");
		badge.className = `platform-badge platform-badge--${getPlatformTheme(platform)}`;
		badge.textContent = platform;
		badges.appendChild(badge);
	}

	return fragment;
}

export function replaceReleaseElement(item, template, release) {
	item.replaceWith(createReleaseElement(template, release));
}

export function renderListMessage(rows, message, className = "") {
	const element = document.createElement("p");
	element.className = `empty-message ${className}`.trim();
	element.textContent = message;
	rows.replaceChildren(element);
}

export function renderEditForm(item, editTemplate, release) {
	const fragment = editTemplate.content.cloneNode(true);
	const form = fragment.querySelector(".edit-form");
	form.elements.title.value = release.title;
	const unknownDate = release.release_date === UNKNOWN_RELEASE_DATE;
	form.elements.release_date.value = unknownDate ? "" : release.release_date;
	form.elements.release_date_unknown.checked = unknownDate;
	form.elements.release_date.id = `edit-release-date-${release.id}`;
	form.querySelector(".release-date-label").htmlFor = form.elements.release_date.id;
	setupReleaseDateInput(form);

	const selectedPlatforms = new Set(parsePlatforms(release.platform));
	for (const checkbox of form.querySelectorAll('input[name="platform"]')) {
		checkbox.checked = selectedPlatforms.has(checkbox.value);
	}

	item.classList.add("release-item--editing");
	item.replaceChildren(fragment);
	form.elements.title.focus();
}

export function setEditLoading(form, loading) {
	for (const element of form.elements) element.disabled = loading;
	if (!loading) syncReleaseDateInput(form);
	form.querySelector(".save-button").textContent = loading ? "저장 중..." : "저장";
}

export function setEditStatus(form, message = "") {
	const status = form.querySelector(".edit-form__status");
	status.textContent = message;
	status.hidden = !message;
}
