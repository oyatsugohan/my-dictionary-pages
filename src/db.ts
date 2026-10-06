import Dexie, { type EntityTable } from 'dexie';
import { getStoredSession } from './apiAuth';

export interface Article {
  id?: number;
  publicId?: string;
  visibility?: 'private' | 'public';
  favorite?: boolean;
  title: string;
  category: string[];
  content: string;
  images: string[]; // base64 strings
  created: string;
  updated?: string;
}

const session = getStoredSession();
// Reserve legacy local data for the account present during upgrade. Never expose it
// to the next guest or account; retain the original database as a recovery copy.
const legacyOwnerKey = 'encyclopedia_legacy_owner';
if (session && !localStorage.getItem(legacyOwnerKey)) localStorage.setItem(legacyOwnerKey, session.user.id);
const guestName = localStorage.getItem(legacyOwnerKey) ? 'EncyclopediaDB-guest' : 'EncyclopediaDB';
const db = new Dexie(session ? `EncyclopediaDB-${session.user.id}` : guestName) as Dexie & {
  articles: EntityTable<Article, 'id'>;
};

// Schema definition
db.version(1).stores({
  articles: '++id, title, *category, created'
});

if (session && localStorage.getItem(legacyOwnerKey) === session.user.id) {
  const migrationKey = `encyclopedia_migrated_${session.user.id}`;
  db.on('ready', async () => {
    if (localStorage.getItem(migrationKey)) return;
    if (await Dexie.exists('EncyclopediaDB')) {
      const legacy = new Dexie('EncyclopediaDB');
      try {
        await legacy.open();
        const articles: Article[] = await legacy.table('articles').toArray();
        await db.transaction('rw', db.articles, async () => {
          for (const article of articles) {
            if (!(await db.articles.where('title').equals(article.title).first())) {
              await db.articles.add({ ...article, id: undefined, visibility: 'private', publicId: undefined });
            }
          }
        });
      } finally { legacy.close(); }
    }
    localStorage.setItem(migrationKey, '1');
  });
}

export { db };
