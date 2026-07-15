const PAGE_SIZE = 50;

const createForm = document.getElementById("createForm");
const createButton = createForm.querySelector(".create-button");
const createStatus = document.getElementById("createStatus");
const rows = document.getElementById("releaseRows");
const template = document.getElementById("releaseTemplate");
const hideReleased = document.getElementById("hideReleased");
const searchForm = document.getElementById("searchForm");
const titleSearch = document.getElementById("titleSearch");
const searchButton = searchForm.querySelector(".search-button");
const loadMoreWrap = document.querySelector(".load-more-wrap");
const loadMoreButton = document.querySelector(".load-more-button");
const listStatus = document.getElementById("listStatus");

let activeQuery = "";
let nextCursor = null;
let hasMore = false;
let requestController;
let requestSequence = 0;
let createStatusTimer;

function getPlatformTheme(platform) {
	const themes = {
		NS: "nintendo",
		NS2: "nintendo",
		PS4: "playstation",
		PS5: "playstation",
		Steam: "steam",
		XBOX: "xbox",
	};
	return themes[platform] ?? "default";
}

function createReleaseElement(release) {
	const fragment = template.content.cloneNode(true);
	const item = fragment.querySelector(".release-item");
	const time = fragment.querySelector("time");

	item.dataset.id = release.id;
	time.dateTime = release.release_date;
	time.textContent = release.release_date;
	fragment.querySelector(".release-item__title strong").textContent = release.title;

	const badges = fragment.querySelector(".platform-badges");
	for (const platform of String(release.platform ?? "").split(",").filter(Boolean)) {
		const badge = document.createElement("span");
		badge.className = `platform-badge platform-badge--${getPlatformTheme(platform)}`;
		badge.textContent = platform;
		badges.appendChild(badge);
	}

	return fragment;
}

function renderMessage(message, className = "") {
	const element = document.createElement("p");
	element.className = `empty-message ${className}`.trim();
	element.textContent = message;
	rows.replaceChildren(element);
}

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

function setCreateStatus(message = "", isError = false, autoHide = false) {
	clearTimeout(createStatusTimer);
	createStatusTimer = undefined;
	createStatus.textContent = message;
	createStatus.classList.toggle("form-status--error", isError);
	createStatus.classList.toggle("form-status--success", Boolean(message) && !isError);
	createStatus.hidden = !message;
	if (message && autoHide) {
		createStatusTimer = setTimeout(() => setCreateStatus(), 3000);
	}
}

function setCreateLoading(loading) {
	for (const element of createForm.elements) {
		element.disabled = loading;
	}
	createButton.textContent = loading ? "등록 중..." : "게임 등록";
}

async function loadReleases({ append = false } = {}) {
	if (append && (!hasMore || !nextCursor)) return;

	if (!append) {
		requestController?.abort();
		nextCursor = null;
		hasMore = false;
		loadMoreWrap.hidden = true;
		renderMessage("게임 목록을 불러오는 중입니다.", "loading-message");
	}

	const requestId = ++requestSequence;
	const controller = new AbortController();
	requestController = controller;
	setStatus();
	setLoading(true, append);

	const params = new URLSearchParams({
		exclude_released: String(hideReleased.checked),
		limit: String(PAGE_SIZE),
	});
	if (activeQuery) params.set("q", activeQuery);
	if (append && nextCursor) params.set("cursor", nextCursor);

	try {
		const response = await fetch(`/api/releases?${params}`, {
			credentials: "same-origin",
			headers: { accept: "application/json" },
			signal: controller.signal,
		});
		const body = await response.json().catch(() => null);
		if (!response.ok) {
			throw new Error(body?.error?.message ?? "게임 목록을 불러오지 못했습니다.");
		}
		if (!body || !Array.isArray(body.releases)) {
			throw new Error("게임 목록 응답 형식이 올바르지 않습니다.");
		}

		if (!append) rows.replaceChildren();
		for (const release of body.releases) {
			rows.appendChild(createReleaseElement(release));
		}

		if (!append && body.releases.length === 0) {
			renderMessage(activeQuery ? "검색 결과가 없습니다." : "표시할 게임이 없습니다.");
		}

		nextCursor = typeof body.next_cursor === "string" ? body.next_cursor : null;
		hasMore = body.has_more === true && nextCursor !== null;
		loadMoreWrap.hidden = !hasMore;
		return true;
	} catch (error) {
		if (error.name === "AbortError") return false;
		const message = error instanceof Error ? error.message : "게임 목록을 불러오지 못했습니다.";
		if (append) {
			setStatus(message, true);
		} else {
			renderMessage(message, "empty-message--error");
		}
		return false;
	} finally {
		if (requestId === requestSequence) {
			setLoading(false, append);
		}
	}
}

createForm.addEventListener("submit", async (event) => {
	event.preventDefault();
	setCreateStatus();

	const form = new FormData(createForm);
	const platforms = form.getAll("platform");
	if (platforms.length === 0) {
		setCreateStatus("플랫폼을 하나 이상 선택해 주세요.", true);
		createForm.querySelector('input[name="platform"]').focus();
		return;
	}

	setCreateLoading(true);
	try {
		const response = await fetch("/api/releases", {
			method: "POST",
			credentials: "same-origin",
			headers: {
				accept: "application/json",
				"content-type": "application/json",
			},
			body: JSON.stringify({
				title: String(form.get("title") ?? "").trim(),
				platform: platforms.join(","),
				release_date: form.get("release_date"),
			}),
		});
		const body = await response.json().catch(() => null);
		if (!response.ok) {
			throw new Error(body?.error?.message ?? "게임을 등록하지 못했습니다.");
		}

		createForm.reset();
		setCreateStatus(`「${body.release.title}」을(를) 등록했습니다.`, false, true);
		await loadReleases();
	} catch (error) {
		const message = error instanceof Error ? error.message : "게임을 등록하지 못했습니다.";
		setCreateStatus(message, true);
	} finally {
		setCreateLoading(false);
	}
});

rows.addEventListener("click", async (event) => {
	const item = event.target.closest(".release-item");
	if (!item) return;

	if (event.target.closest(".edit-button")) {
		alert("게임 수정 API 연결은 다음 단계에서 적용할 예정입니다.");
	}

	const deleteButton = event.target.closest(".delete-button");
	if (!deleteButton) return;

	const title = item.querySelector(".release-item__title strong").textContent;
	if (!confirm(`「${title}」을(를) 삭제할까요?\n삭제한 데이터는 복구할 수 없습니다.`)) return;

	const actionButtons = item.querySelectorAll("button");
	for (const button of actionButtons) button.disabled = true;
	deleteButton.textContent = "삭제 중...";
	setStatus();

	try {
		const response = await fetch(`/api/releases/${encodeURIComponent(item.dataset.id)}`, {
			method: "DELETE",
			credentials: "same-origin",
			headers: { accept: "application/json" },
		});
		if (!response.ok) {
			const body = await response.json().catch(() => null);
			throw new Error(body?.error?.message ?? "게임을 삭제하지 못했습니다.");
		}

		const reloaded = await loadReleases();
		if (!reloaded) {
			setStatus(`「${title}」은(는) 삭제했지만 목록을 다시 불러오지 못했습니다.`, true);
		}
	} catch (error) {
		const message = error instanceof Error ? error.message : "게임을 삭제하지 못했습니다.";
		setStatus(message, true);
		for (const button of actionButtons) button.disabled = false;
		deleteButton.textContent = "삭제";
	}
});

searchForm.addEventListener("submit", (event) => {
	event.preventDefault();
	activeQuery = titleSearch.value.trim();
	loadReleases();
});

hideReleased.addEventListener("change", () => {
	loadReleases();
});

loadMoreButton.addEventListener("click", () => {
	loadReleases({ append: true });
});

loadReleases();
