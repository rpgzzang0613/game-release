import { fetchReleases } from "./modules/api.js";
import {
	clearReleaseList,
	renderReleaseList,
	renderReleaseListSkeleton,
} from "./modules/release-list.js";

async function loadReleaseList() {
	const releaseList = document.getElementById("releaseList");
	renderReleaseListSkeleton(releaseList);

	try {
		const releases = await fetchReleases();
		renderReleaseList(releaseList, releases);
	} catch {
		clearReleaseList(releaseList);
		alert("데이터를 불러오지 못했습니다.");
	}
}

document.addEventListener("DOMContentLoaded", loadReleaseList);
