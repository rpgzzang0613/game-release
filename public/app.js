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

function renderSkeleton(tbody) {
	tbody.setAttribute("aria-busy", "true");
	tbody.innerHTML = `
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

async function loadReleaseList() {
	const tbody = document.getElementById("releaseList");
	renderSkeleton(tbody);

	let response;

	try {
		response = await fetch("/api/releases");
	} catch {
		tbody.innerHTML = "";
		tbody.removeAttribute("aria-busy");
		alert("데이터를 불러오지 못했습니다.");
		return;
	}

	if (!response.ok) {
		tbody.innerHTML = "";
		tbody.removeAttribute("aria-busy");
		alert("데이터를 불러오지 못했습니다.");
		return;
	}

	const list = await response.json();

	tbody.innerHTML = "";
	tbody.removeAttribute("aria-busy");
	let currentMonth = "";

	for (const item of list) {
		const monthKey = String(item.release_date ?? "").slice(0, 7);

		if (monthKey && monthKey !== currentMonth) {
			const [year, month] = monthKey.split("-");
			const monthRow = document.createElement("tr");
			monthRow.className = "month-row";

			const monthTd = document.createElement("td");
			monthTd.colSpan = 3;
			monthTd.textContent = `${year}년 ${Number(month)}월`;

			monthRow.appendChild(monthTd);
			tbody.appendChild(monthRow);
			currentMonth = monthKey;
		}

		const tr = document.createElement("tr");
		tr.className = "release-row";

		const releaseDateTd = document.createElement("td");
		releaseDateTd.className = "release-date";
		releaseDateTd.dataset.label = "발매일";
		releaseDateTd.textContent = item.release_date;

		const titleTd = document.createElement("td");
		titleTd.className = "game-title";
		titleTd.dataset.label = "게임명";
		titleTd.textContent = item.title;

		const platformTd = document.createElement("td");
		platformTd.className = "platform-cell";
		platformTd.dataset.label = "플랫폼";
		const platformList = String(item.platform ?? "")
			.split(",")
			.map((platform) => platform.trim())
			.filter(Boolean);

		const platformGroup = document.createElement("div");
		platformGroup.className = "platform-list";

		for (const platform of platformList) {
			const badge = document.createElement("span");
			badge.className = `platform-badge platform-badge--${getPlatformTheme(platform)}`;
			badge.textContent = platform;
			platformGroup.appendChild(badge);
		}

		platformTd.appendChild(platformGroup);

		tr.appendChild(releaseDateTd);
		tr.appendChild(titleTd);
		tr.appendChild(platformTd);

		tbody.appendChild(tr);
	}
}

document.addEventListener("DOMContentLoaded", loadReleaseList);
