export const UNKNOWN_RELEASE_DATE = "9999-12-31";

export function syncReleaseDateInput(form) {
	form.elements.release_date.disabled = form.elements.release_date_unknown.disabled || form.elements.release_date_unknown.checked;
}

export function setupReleaseDateInput(form) {
	form.elements.release_date_unknown.addEventListener("change", () => {
		if (form.elements.release_date_unknown.checked) {
			form.elements.release_date.value = "";
		}
		syncReleaseDateInput(form);
	});
	form.addEventListener("reset", () => queueMicrotask(() => syncReleaseDateInput(form)));
	syncReleaseDateInput(form);
}
