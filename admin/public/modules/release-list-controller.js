import { deleteRelease, fetchReleases, updateRelease } from "./api.js";
import { focusFirstPlatformOption } from "./platform.js";
import { readReleaseFormData } from "./release-form-data.js";
import {
	createReleaseElement,
	renderEditForm,
	renderListMessage,
	replaceReleaseElement,
	setEditLoading,
	setEditStatus,
} from "./release-list-renderer.js";

const PAGE_SIZE = 50;

export function setupReleaseList() {
	const rows = document.getElementById("releaseRows");
	const releaseTemplate = document.getElementById("releaseTemplate");
	const editTemplate = document.getElementById("editTemplate");
	const hideReleased = document.getElementById("hideReleased");
	const searchForm = document.getElementById("searchForm");
	const titleSearch = document.getElementById("titleSearch");
	const searchButton = searchForm.querySelector(".search-button");
	const loadMoreWrap = document.querySelector(".load-more-wrap");
	const loadMoreButton = document.querySelector(".load-more-button");
	const listStatus = document.getElementById("listStatus");

	const releasesById = new Map();
	let activeQuery = "";
	let nextCursor = null;
	let hasMore = false;
	let requestController;
	let requestSequence = 0;
	let editingId = null;

	function setStatus(message = "", isError = false) {
		listStatus.textContent = message;
		listStatus.classList.toggle("list-status--error", isError);
		listStatus.hidden = !message;
	}

	function setLoading(loading, append) {
		searchButton.disabled = loading;
		hideReleased.disabled = loading;
		loadMoreButton.disabled = loading;
		loadMoreButton.textContent = loading && append ? "불러오는 중..." : "더 보기";
		rows.setAttribute("aria-busy", String(loading));
	}

	function beginEdit(item) {
		const id = item.dataset.id;
		const release = releasesById.get(id);
		if (!release) return;

		if (editingId && editingId !== id) {
			const currentItem = rows.querySelector(`.release-item[data-id="${CSS.escape(editingId)}"]`);
			const currentRelease = releasesById.get(editingId);
			if (currentItem && currentRelease) {
				replaceReleaseElement(currentItem, releaseTemplate, currentRelease);
			}
		}

		renderEditForm(item, editTemplate, release);
		editingId = id;
	}

	function cancelEdit(item) {
		const release = releasesById.get(item.dataset.id);
		if (release) replaceReleaseElement(item, releaseTemplate, release);
		editingId = null;
	}

	async function load({ append = false } = {}) {
		if (append && (!hasMore || !nextCursor)) return false;

		if (!append) {
			requestController?.abort();
			nextCursor = null;
			hasMore = false;
			loadMoreWrap.hidden = true;
			renderListMessage(rows, "게임 목록을 불러오는 중입니다.", "loading-message");
		}

		const requestId = ++requestSequence;
		const controller = new AbortController();
		requestController = controller;
		setStatus();
		setLoading(true, append);

		try {
			const body = await fetchReleases({
				query: activeQuery,
				excludeReleased: hideReleased.checked,
				limit: PAGE_SIZE,
				cursor: append ? nextCursor : null,
				signal: controller.signal,
			});

			if (!append) {
				rows.replaceChildren();
				releasesById.clear();
				editingId = null;
			}
			for (const release of body.releases) {
				releasesById.set(String(release.id), release);
				rows.appendChild(createReleaseElement(releaseTemplate, release));
			}

			if (!append && body.releases.length === 0) {
				renderListMessage(rows, activeQuery ? "검색 결과가 없습니다." : "표시할 게임이 없습니다.");
			}

			nextCursor = typeof body.next_cursor === "string" ? body.next_cursor : null;
			hasMore = body.has_more === true && nextCursor !== null;
			loadMoreWrap.hidden = !hasMore;
			return true;
		} catch (error) {
			if (error.name === "AbortError") return false;
			const message = error instanceof Error ? error.message : "게임 목록을 불러오지 못했습니다.";
			if (append) setStatus(message, true);
			else renderListMessage(rows, message, "empty-message--error");
			return false;
		} finally {
			if (requestId === requestSequence) setLoading(false, append);
		}
	}

	async function handleDelete(item, deleteButton) {
		const title = item.querySelector(".release-item__title strong").textContent;
		if (!confirm(`「${title}」을(를) 삭제할까요?\n삭제한 데이터는 복구할 수 없습니다.`)) return;

		const actionButtons = item.querySelectorAll("button");
		for (const button of actionButtons) button.disabled = true;
		deleteButton.textContent = "삭제 중...";
		setStatus();

		try {
			await deleteRelease(item.dataset.id);
			const reloaded = await load();
			if (!reloaded) {
				setStatus(`「${title}」은(는) 삭제했지만 목록을 다시 불러오지 못했습니다.`, true);
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : "게임을 삭제하지 못했습니다.";
			setStatus(message, true);
			for (const button of actionButtons) button.disabled = false;
			deleteButton.textContent = "삭제";
		}
	}

	async function handleEditSubmit(form) {
		const item = form.closest(".release-item");
		const { input, platforms } = readReleaseFormData(form);
		setEditStatus(form);
		if (platforms.length === 0) {
			setEditStatus(form, "플랫폼을 하나 이상 선택해 주세요.");
			focusFirstPlatformOption(form);
			return;
		}

		setEditLoading(form, true);
		try {
			await updateRelease(item.dataset.id, input);
			editingId = null;
			const reloaded = await load();
			if (!reloaded) setStatus("게임은 수정했지만 목록을 다시 불러오지 못했습니다.", true);
		} catch (error) {
			const message = error instanceof Error ? error.message : "게임을 수정하지 못했습니다.";
			setEditStatus(form, message);
			setEditLoading(form, false);
		}
	}

	rows.addEventListener("click", (event) => {
		const item = event.target.closest(".release-item");
		if (!item) return;

		if (event.target.closest(".edit-button")) return beginEdit(item);
		if (event.target.closest(".cancel-button")) return cancelEdit(item);

		const deleteButton = event.target.closest(".delete-button");
		if (deleteButton) handleDelete(item, deleteButton);
	});

	rows.addEventListener("submit", (event) => {
		const form = event.target.closest(".edit-form");
		if (!form) return;
		event.preventDefault();
		handleEditSubmit(form);
	});

	searchForm.addEventListener("submit", (event) => {
		event.preventDefault();
		activeQuery = titleSearch.value.trim();
		load();
	});

	hideReleased.addEventListener("change", () => load());
	loadMoreButton.addEventListener("click", () => load({ append: true }));

	return { load };
}
