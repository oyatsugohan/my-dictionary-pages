import { verifySession } from "./auth/_utils";
interface Env {
 DB: D1Database;
}
export const onRequest: PagesFunction<Env> = async (context) => {
 const { request, env } = context;
 // GET: 公開記事の一覧を取得(ログイン不要、誰でも見られる)
 if (request.method === "GET") {
   try {
     const result = await env.DB.prepare(
       "SELECT id, user_id, username, title, category, content, images, published_at, updated_at FROM public_articles ORDER BY published_at DESC"
     ).all();
     return new Response(JSON.stringify(result.results), {
       headers: { "Content-Type": "application/json" },
     });
   } catch (err) {
     return new Response(JSON.stringify({ error: (err as Error).message }), {
       status: 500,
       headers: { "Content-Type": "application/json" },
     });
   }
 }
 // POST: 記事を投稿(公開)する。ログイン必須
 if (request.method === "POST") {
   const authHeader = request.headers.get("Authorization");
   if (!authHeader || !authHeader.startsWith("Bearer ")) {
     return new Response(JSON.stringify({ error: "Unauthorized: Missing session token" }), {
       status: 401,
       headers: { "Content-Type": "application/json" },
     });
   }
   const token = authHeader.split(" ")[1];
   const userId = await verifySession(env.DB, token);
   if (!userId) {
     return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired session" }), {
       status: 401,
       headers: { "Content-Type": "application/json" },
     });
   }
   try {
     const body = await request.json() as {
       id: string;
       username: string;
       title: string;
       category: string[];
       content: string;
       images: string[];
     };
     await env.DB.prepare(
       `INSERT INTO public_articles (id, user_id, username, title, category, content, images, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          category = excluded.category,
          content = excluded.content,
          images = excluded.images,
          updated_at = CURRENT_TIMESTAMP`
     )
       .bind(
         body.id,
         userId,
         body.username,
         body.title,
         JSON.stringify(body.category),
         body.content,
         JSON.stringify(body.images)
       )
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
 // DELETE: 投稿を取り消す。ログイン必須、かつ自分の投稿のみ削除可能
 if (request.method === "DELETE") {
   const authHeader = request.headers.get("Authorization");
   if (!authHeader || !authHeader.startsWith("Bearer ")) {
     return new Response(JSON.stringify({ error: "Unauthorized: Missing session token" }), {
       status: 401,
       headers: { "Content-Type": "application/json" },
     });
   }
   const token = authHeader.split(" ")[1];
   const userId = await verifySession(env.DB, token);
   if (!userId) {
     return new Response(JSON.stringify({ error: "Unauthorized: Invalid or expired session" }), {
       status: 401,
       headers: { "Content-Type": "application/json" },
     });
   }
   try {
     const url = new URL(request.url);
     const id = url.searchParams.get("id");
     if (!id) {
       return new Response(JSON.stringify({ error: "Missing id" }), {
         status: 400,
         headers: { "Content-Type": "application/json" },
       });
     }
     await env.DB.prepare(
       "DELETE FROM public_articles WHERE id = ? AND user_id = ?"
     )
       .bind(id, userId)
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