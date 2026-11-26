import { getPlatformTheme, parsePlatforms } from "./platform.js";

const UNKNOWN_RELEASE_DATE = "9999-12-31";

function createMonthRow(monthKey) {
	const [year, month] = monthKey.split("-");
	const row = document.createElement("tr");
	row.className = "month-row";

	const cell = document.createElement("td");
	cell.colSpan = 3;
	cell.textContent = monthKey === "미정" ? "미정" : `${year}년 ${Number(month)}월`;

	row.appendChild(cell);
	return row;
}

function createPlatformBadge(platform) {
	const badge = document.createElement("span");
	badge.className = `platform-badge platform-badge--${getPlatformTheme(platform)}`;
	badge.textContent = platform;
	return badge;
}

function createReleaseRow(release) {
	const row = document.createElement("tr");
	row.className = "release-row";

	const releaseDateCell = document.createElement("td");
	releaseDateCell.className = "release-date";
	releaseDateCell.dataset.label = "발매일";
	releaseDateCell.textContent = release.release_date === UNKNOWN_RELEASE_DATE
		? "미정"
		: release.release_date;

	const titleCell = document.createElement("td");
	titleCell.className = "game-title";
	titleCell.dataset.label = "게임명";
	titleCell.textContent = release.title;

	const platformCell = document.createElement("td");
	platformCell.className = "platform-cell";
	platformCell.dataset.label = "플랫폼";

	const platformList = document.createElement("div");
	platformList.className = "platform-list";
	for (const platform of parsePlatforms(release.platform)) {
		platformList.appendChild(createPlatformBadge(platform));
	}

	platformCell.appendChild(platformList);
	row.append(releaseDateCell, titleCell, platformCell);
	return row;
}

export function renderReleaseListSkeleton(releaseList) {
	releaseList.setAttribute("aria-busy", "true");
	releaseList.innerHTML = `
		<tr class="month-row skeleton-month" aria-hidden="true">
			<td colspan="3"><span class="skeleton-block"></span></td>
		</tr>
		${Array.from({ length: 4 }, () => `
			<tr class="release-row skeleton-row" aria-hidden="true">
				<td data-label="발매일"><span class="skeleton-block skeleton-date"></span></td>
				<td data-label="게임명"><span class="skeleton-block skeleton-title"></span></td>
				<td data-label="플랫폼"><span class="skeleton-block skeleton-platform"></span></td>
			</tr>
		`).join("")}
	`;
}

export function clearReleaseList(releaseList) {
	releaseList.replaceChildren();
	releaseList.removeAttribute("aria-busy");
}

export function renderReleaseList(releaseList, releases) {
	clearReleaseList(releaseList);
	let currentMonth = "";

	for (const release of releases) {
		const monthKey = release.release_date === UNKNOWN_RELEASE_DATE
			? "미정"
			: String(release.release_date ?? "").slice(0, 7);

		if (monthKey && monthKey !== currentMonth) {
			releaseList.appendChild(createMonthRow(monthKey));
			currentMonth = monthKey;
		}

		releaseList.appendChild(createReleaseRow(release));
	}
}
