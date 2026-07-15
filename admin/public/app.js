const releases = [
	{ id: 0, title: "엘든 링 밤의 통치자", platform: "PS4,PS5,XBOX,Steam", release_date: "2026-06-26" },
	{ id: 1, title: "동키콩 바난자", platform: "NS2", release_date: "2026-07-17" },
	{ id: 2, title: "닌자 가이덴 4", platform: "PS5,XBOX,Steam", release_date: "2026-10-21" },
	{ id: 3, title: "포켓몬 레전즈 Z-A", platform: "NS,NS2", release_date: "2026-10-30" },
	{ id: 4, title: "어쌔신 크리드 섀도우", platform: "NS2,PS5,XBOX,Steam", release_date: "2026-11-12" },
];

const rows = document.getElementById("releaseRows");
const template = document.getElementById("releaseTemplate");
const hideReleased = document.getElementById("hideReleased");

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

function renderReleases() {
	rows.replaceChildren();
	const today = getTodayInKorea();
	const visibleReleases = hideReleased.checked
		? releases.filter((release) => release.release_date >= today)
		: releases;

	for (const release of visibleReleases) {
		const fragment = template.content.cloneNode(true);
		const item = fragment.querySelector(".release-item");
		const time = fragment.querySelector("time");

		item.dataset.id = release.id;
		time.dateTime = release.release_date;
		time.textContent = release.release_date;
		fragment.querySelector(".release-item__title strong").textContent = release.title;

		const badges = fragment.querySelector(".platform-badges");
		for (const platform of release.platform.split(",")) {
			const badge = document.createElement("span");
			badge.className = `platform-badge platform-badge--${getPlatformTheme(platform)}`;
			badge.textContent = platform;
			badges.appendChild(badge);
		}

		rows.appendChild(fragment);
	}

	if (visibleReleases.length === 0) {
		const message = document.createElement("p");
		message.className = "empty-message";
		message.textContent = "표시할 게임이 없습니다.";
		rows.appendChild(message);
	}
}

function getTodayInKorea() {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone: "Asia/Seoul",
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	}).formatToParts(new Date());
	const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
	return `${values.year}-${values.month}-${values.day}`;
}

document.getElementById("createForm").addEventListener("submit", (event) => {
	event.preventDefault();
	const form = new FormData(event.currentTarget);
	const platforms = form.getAll("platform");
	if (platforms.length === 0) {
		alert("플랫폼을 하나 이상 선택해 주세요.");
		return;
	}

	releases.push({
		id: Date.now(),
		title: form.get("title").trim(),
		platform: platforms.join(","),
		release_date: form.get("release_date"),
	});
	releases.sort((a, b) => a.release_date.localeCompare(b.release_date));
	event.currentTarget.reset();
	renderReleases();
});

rows.addEventListener("click", (event) => {
	const item = event.target.closest(".release-item");
	if (!item) return;

	if (event.target.closest(".edit-button")) {
		alert("다음 단계에서 이 카드 안에 수정 입력칸이 열리도록 연결할 예정입니다.");
	}

	if (event.target.closest(".delete-button")) {
		alert("다음 단계에서 삭제 확인창과 API를 연결할 예정입니다.");
	}
});

hideReleased.addEventListener("change", renderReleases);

document.getElementById("searchForm").addEventListener("submit", (event) => {
	event.preventDefault();
	alert("검색 API 연결은 다음 단계에서 적용할 예정입니다.");
});

document.querySelector(".load-more-button").addEventListener("click", () => {
	alert("페이지네이션 API 연결은 다음 단계에서 적용할 예정입니다.");
});

renderReleases();
