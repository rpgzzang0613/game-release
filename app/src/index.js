export default {
	async fetch(request, env, ctx) {
		const url = new URL(request.url);

		if (url.pathname === "/api/releases") {
			const { results } = await env.DB.prepare(`
				SELECT title
				     , platform
					   , release_date
				  FROM game_release
				 WHERE release_date >= date('now', '+9 hours')
				 ORDER BY release_date
			`).all();

			return Response.json(results);
		}

		return env.ASSETS.fetch(request);
	},
};

