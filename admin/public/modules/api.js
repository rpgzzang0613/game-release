const JSON_HEADERS = {
	accept: "application/json",
	"content-type": "application/json",
};

async function readJson(response) {
	return response.json().catch(() => null);
}

async function throwResponseError(response, fallbackMessage) {
	const body = await readJson(response);
	throw new Error(body?.error?.message ?? fallbackMessage);
}

export async function fetchReleases({ query, excludeReleased, limit, cursor, signal }) {
	const params = new URLSearchParams({
		exclude_released: String(excludeReleased),
		limit: String(limit),
	});
	if (query) params.set("q", query);
	if (cursor) params.set("cursor", cursor);

	const response = await fetch(`/api/releases?${params}`, {
		credentials: "same-origin",
		headers: { accept: "application/json" },
		signal,
	});
	if (!response.ok) await throwResponseError(response, "게임 목록을 불러오지 못했습니다.");

	const body = await readJson(response);
	if (!body || !Array.isArray(body.releases)) {
		throw new Error("게임 목록 응답 형식이 올바르지 않습니다.");
	}
	return body;
}

export async function createRelease(input) {
	const response = await fetch("/api/releases", {
		method: "POST",
		credentials: "same-origin",
		headers: JSON_HEADERS,
		body: JSON.stringify(input),
	});
	if (!response.ok) await throwResponseError(response, "게임을 등록하지 못했습니다.");

	const body = await readJson(response);
	return body.release;
}

export async function updateRelease(id, input) {
	const response = await fetch(`/api/releases/${encodeURIComponent(id)}`, {
		method: "PUT",
		credentials: "same-origin",
		headers: JSON_HEADERS,
		body: JSON.stringify(input),
	});
	if (!response.ok) await throwResponseError(response, "게임을 수정하지 못했습니다.");

	const body = await readJson(response);
	return body.release;
}

export async function deleteRelease(id) {
	const response = await fetch(`/api/releases/${encodeURIComponent(id)}`, {
		method: "DELETE",
		credentials: "same-origin",
		headers: { accept: "application/json" },
	});
	if (!response.ok) await throwResponseError(response, "게임을 삭제하지 못했습니다.");
}
