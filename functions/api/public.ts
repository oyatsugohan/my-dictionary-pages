import { verifySession } from './auth/_utils.ts';
interface Env { DB: D1Database }
const json = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const strings = (value: unknown, maxItems: number, maxLength: number): value is string[] =>
  Array.isArray(value) && value.length <= maxItems && value.every(v => typeof v === 'string' && v.length <= maxLength);

export const onRequest: PagesFunction<Env> = async ({ request, env }) => {
  try {
    if (request.method === 'GET') {
      const result = await env.DB.prepare('SELECT id, user_id, username, title, category, content, images, published_at, updated_at FROM public_articles ORDER BY published_at DESC, id').all();
      return json(result.results);
    }
    if (!['POST', 'DELETE'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
    const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    const userId = token ? await verifySession(env.DB, token) : null;
    if (!userId) return json({ error: 'ログインし直してください。' }, 401);
    if (request.method === 'DELETE') {
      const id = new URL(request.url).searchParams.get('id');
      if (!id) return json({ error: '記事IDが必要です。' }, 400);
      const result = await env.DB.prepare('DELETE FROM public_articles WHERE id = ? AND user_id = ?').bind(id, userId).run();
      return result.meta.changes ? json({ success: true }) : json({ error: '記事が見つかりません。' }, 404);
    }
    const text = await request.text();
    if (new TextEncoder().encode(text).length > 1_500_000) return json({ error: '画像を含めた記事のサイズを1.5MB以内にしてください。' }, 413);
    let body;
    try { body = JSON.parse(text); } catch { return json({ error: 'JSON形式が不正です。' }, 400); }
    if (!body || typeof body.id !== 'string' || !/^[\w:-]{1,160}$/.test(body.id) ||
        typeof body.title !== 'string' || !body.title.trim() || body.title.length > 200 ||
        typeof body.content !== 'string' || !body.content.trim() || body.content.length > 100_000 ||
        !strings(body.category, 20, 40) || !strings(body.images, 10, 1_400_000) ||
        body.images.some((image: string) => !/^data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(image))) {
      return json({ error: 'タイトル200字、本文10万字、タグ20個（各40字）、画像10枚以内で入力してください。画像はPNG・JPEG・GIF・WebPに対応しています。' }, 400);
    }
    const user = await env.DB.prepare('SELECT username FROM users WHERE id = ?').bind(userId).first<{ username: string }>();
    if (!user) return json({ error: 'ログインし直してください。' }, 401);
    // Ownership is checked inside the upsert too, so a racing insert cannot bypass it.
    const result = await env.DB.prepare(`INSERT INTO public_articles (id,user_id,username,title,category,content,images,updated_at)
      VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(id) DO UPDATE SET username=excluded.username,title=excluded.title,category=excluded.category,
      content=excluded.content,images=excluded.images,updated_at=CURRENT_TIMESTAMP
      WHERE public_articles.user_id=excluded.user_id`)
      .bind(body.id, userId, user.username, body.title.trim(), JSON.stringify([...new Set(body.category.map((t: string) => t.trim()).filter(Boolean))]), body.content, JSON.stringify(body.images)).run();
    return result.meta.changes ? json({ success: true }) : json({ error: '他の人の記事は変更できません。' }, 403);
  } catch (error) {
    console.error('Public articles request failed', error);
    return json({ error: '公開記事を読み書きできませんでした。時間をおいて再試行してください。' }, 500);
  }
};
