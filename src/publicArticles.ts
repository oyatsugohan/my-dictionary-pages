import { getStoredSession } from './apiAuth';
import type { Article } from './db';

export interface PublicArticle {
  id: string; user_id: string; username: string; title: string;
  category: string[]; content: string; images: string[];
  published_at: string; updated_at: string;
}
export async function getPublicArticles(signal?: AbortSignal): Promise<PublicArticle[]> {
  const response = await fetch('/api/public', { cache: 'no-store', signal });
  if (!response.ok) throw new Error('公開記事を取得できませんでした。再読み込みしてください。');
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error('公開記事の形式が不正です。');
  return data.map(item => ({ ...item, category: JSON.parse(item.category), images: JSON.parse(item.images) }));
}
export async function setPublicArticle(article: Article, visibility: 'private' | 'public') {
  if (!article.publicId && visibility === 'private') return;
  const session = getStoredSession();
  if (!session) throw new Error('公開設定を変更するには百科事典のアカウントでログインしてください。');
  const id = article.publicId;
  if (!id) throw new Error('記事の公開IDがありません。');
  const response = await fetch(visibility === 'public' ? '/api/public' : `/api/public?id=${encodeURIComponent(id)}`, {
    method: visibility === 'public' ? 'POST' : 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` },
    body: visibility === 'public' ? JSON.stringify({ ...article, id }) : undefined,
  });
  if (!response.ok && !(visibility === 'private' && response.status === 404)) {
    const error = await response.json();
    throw new Error(error.error || '公開設定を変更できませんでした。');
  }
}
