import { db } from "./db";

/**
 * Cloudflare Pages Functions を利用した同期ロジック
 */

const SYNC_API_PATH = "/api/sync";

// ユーザーIDの取得
export const getUserId = () => {
  let id = localStorage.getItem("cf_sync_user_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("cf_sync_user_id", id);
  }
  return id;
};

// ユーザーIDの手動設定
export const setUserId = (id: string) => {
  if (id.trim()) {
    localStorage.setItem("cf_sync_user_id", id.trim());
    return true;
  }
  return false;
};

export const syncToCloudflare = async () => {
  const userId = getUserId();
  const articles = await db.articles.toArray();
  const content = JSON.stringify(articles);

  try {
    const response = await fetch(`${SYNC_API_PATH}?userId=${userId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
  const userId = getUserId();

  try {
    const response = await fetch(`${SYNC_API_PATH}?userId=${userId}`);
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
