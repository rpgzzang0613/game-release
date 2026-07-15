const PAGE_SIZE = 50;

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
	} catch (error) {
		if (error.name === "AbortError") return;
		const message = error instanceof Error ? error.message : "게임 목록을 불러오지 못했습니다.";
		if (append) {
			setStatus(message, true);
		} else {
			renderMessage(message, "empty-message--error");
		}
	} finally {
		if (requestId === requestSequence) {
			setLoading(false, append);
		}
	}
}

document.getElementById("createForm").addEventListener("submit", (event) => {
	event.preventDefault();
	alert("게임 등록 API 연결은 다음 단계에서 적용할 예정입니다.");
});

rows.addEventListener("click", (event) => {
	const item = event.target.closest(".release-item");
	if (!item) return;

	if (event.target.closest(".edit-button")) {
		alert("게임 수정 API 연결은 다음 단계에서 적용할 예정입니다.");
	}

	if (event.target.closest(".delete-button")) {
		alert("게임 삭제 API 연결은 다음 단계에서 적용할 예정입니다.");
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
