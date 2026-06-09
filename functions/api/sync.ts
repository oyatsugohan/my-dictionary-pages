interface Env {
  DB: D1Database;
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env } = context;
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId") || "default_user"; // 簡易的なユーザー識別（将来的に認証を追加可能）

  // GET: バックアップデータの取得
  if (request.method === "GET") {
    try {
      const result = await env.DB.prepare(
        "SELECT data FROM articles_sync WHERE user_id = ?"
      )
        .bind(userId)
        .first<{ data: string }>();

      if (!result) {
        return new Response(JSON.stringify([]), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(result.data, {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // POST/PUT: バックアップデータの保存
  if (request.method === "POST" || request.method === "PUT") {
    try {
      const data = await request.text();
      // JSONの妥当性チェック
      JSON.parse(data);

      await env.DB.prepare(
        "INSERT INTO articles_sync (user_id, data, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = CURRENT_TIMESTAMP"
      )
        .bind(userId, data)
        .run();

      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: (err as Error).message }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Method not allowed", { status: 405 });
};
