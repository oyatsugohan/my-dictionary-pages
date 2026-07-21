import { db } from "./db";
import { getStoredSession } from "./apiAuth";

/**
 * Cloudflare Pages Functions を利用した同期ロジック
 */

const SYNC_API_PATH = "/api/sync";

export const syncToCloudflare = async () => {
  const session = getStoredSession();
  if (!session) {
    console.warn("Cloudflare Sync: Not logged in");
    return false;
  }

  const articles = await db.articles.toArray();
  const content = JSON.stringify(articles);

  try {
    const response = await fetch(SYNC_API_PATH, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${session.token}`,
      },
      body: content,
    });

    if (!response.ok) throw new Error("Cloudflare Sync Failed");
    console.log("Cloudflare Sync Successful");
    return true;
  } catch (error) {
    console.error("Cloudflare Sync Error", error);
    return false;
  }
};

export const loadFromCloudflare = async () => {
  const session = getStoredSession();
  if (!session) {
    console.warn("Cloudflare Load: Not logged in");
    return false;
  }

  try {
    const response = await fetch(SYNC_API_PATH, {
      headers: {
        "Authorization": `Bearer ${session.token}`,
      }
    });
    if (!response.ok) throw new Error("Cloudflare Load Failed");

    const data = await response.json();

    if (Array.isArray(data) && data.length > 0) {
      let updatedCount = 0;
      
      for (const remoteItem of data) {
        // タイトルをキーにして既存の記事を探す
        const localItem = await db.articles.where("title").equals(remoteItem.title).first();

        if (!localItem) {
          // ローカルに存在しない場合は新規追加
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { id, ...rest } = remoteItem;
          await db.articles.add(rest);
          updatedCount++;
        } else {
          // ローカルに存在する場合、日付を比較してリモートの方が新しければ更新
          const remoteDate = new Date(remoteItem.updated || remoteItem.created).getTime();
          const localDate = new Date(localItem.updated || localItem.created).getTime();

          if (remoteDate > localDate) {
            await db.articles.update(localItem.id!, {
              category: remoteItem.category,
              content: remoteItem.content,
              images: remoteItem.images,
              updated: remoteItem.updated || remoteItem.created
            });
            updatedCount++;
          }
        }
      }
      
      // 何らかの更新があった場合、マージされた結果をサーバーに反映（双方向同期）
      if (updatedCount > 0) {
        await syncToCloudflare();
      }
      
      return true;
    }
  } catch (error) {
    console.warn("Error loading from Cloudflare", error);
  }
  return false;
};
