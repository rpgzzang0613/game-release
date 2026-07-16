export async function fetchReleases() {
	const response = await fetch("/api/releases");

	if (!response.ok) {
		throw new Error(`게임 목록 조회 실패: ${response.status}`);
	}

	return response.json();
}
