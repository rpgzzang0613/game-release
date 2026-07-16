import { createRelease } from "./api.js";
import { focusFirstPlatformOption } from "./platform.js";
import { readReleaseFormData } from "./release-form-data.js";

const SUCCESS_MESSAGE_DURATION = 5000;

export function setupCreateReleaseForm({ onCreated }) {
	const form = document.getElementById("createForm");
	const button = form.querySelector(".create-button");
	const status = document.getElementById("createStatus");
	let statusTimer;

	function setStatus(message = "", { error = false, autoHide = false } = {}) {
		clearTimeout(statusTimer);
		statusTimer = undefined;
		status.textContent = message;
		status.classList.toggle("form-status--error", error);
		status.classList.toggle("form-status--success", Boolean(message) && !error);
		status.hidden = !message;

		if (message && autoHide) {
			statusTimer = setTimeout(() => setStatus(), SUCCESS_MESSAGE_DURATION);
		}
	}

	function setLoading(loading) {
		for (const element of form.elements) element.disabled = loading;
		button.textContent = loading ? "등록 중..." : "게임 등록";
	}

	form.addEventListener("submit", async (event) => {
		event.preventDefault();
		setStatus();

		const { input, platforms } = readReleaseFormData(form);
		if (platforms.length === 0) {
			setStatus("플랫폼을 하나 이상 선택해 주세요.", { error: true });
			focusFirstPlatformOption(form);
			return;
		}

		setLoading(true);
		try {
			const release = await createRelease(input);
			form.reset();
			setStatus(`「${release.title}」을(를) 등록했습니다.`, { autoHide: true });
			await onCreated();
		} catch (error) {
			const message = error instanceof Error ? error.message : "게임을 등록하지 못했습니다.";
			setStatus(message, { error: true });
		} finally {
			setLoading(false);
		}
	});
}
