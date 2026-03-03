import Dexie, { type EntityTable } from 'dexie';

export interface Article {
  id?: number;
  title: string;
  category: string[];
  content: string;
  images: string[]; // base64 strings
  created: string;
  updated?: string;
}

const db = new Dexie('EncyclopediaDB') as Dexie & {
  articles: EntityTable<Article, 'id'>;
};

// Schema definition
db.version(1).stores({
  articles: '++id, title, *category, created'
});

export { db };
