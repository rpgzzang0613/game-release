const IDENTITY_ENDPOINT = "/cdn-cgi/access/get-identity";

export async function displayAccessIdentity() {
	const label = document.querySelector(".access-status__identity");
	if (!label) return;

	try {
		const response = await fetch(IDENTITY_ENDPOINT, {
			credentials: "same-origin",
			headers: { accept: "application/json" },
			cache: "no-store",
		});
		if (!response.ok) return;

		const identity = await response.json();
		const name = typeof identity.name === "string" ? identity.name.trim() : "";
		const email = typeof identity.email === "string" ? identity.email.trim() : "";
		const displayName = name || email;
		if (!displayName) return;

		label.textContent = displayName;
		label.title = name && email ? `${name} (${email})` : displayName;
	} catch {
		// localhost처럼 Access Identity를 제공하지 않는 환경에서는 기본 문구를 유지합니다.
	}
}
