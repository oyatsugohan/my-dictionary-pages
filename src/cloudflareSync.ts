import { db } from "./db";

/**
 * Cloudflare Pages Functions を利用した同期ロジック
 */

const SYNC_API_PATH = "/api/sync";

// ユーザーIDの取得（現在は簡易的にlocalStorageに保存、将来的にはAuth連携）
const getUserId = () => {
  let id = localStorage.getItem("cf_sync_user_id");
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem("cf_sync_user_id", id);
  }
  return id;
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

    if (Array.isArray(data)) {
      await db.articles.clear();
      for (const item of data) {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, ...rest } = item;
        await db.articles.add(rest);
      }
      return true;
    }
  } catch (error) {
    console.warn("Error loading from Cloudflare", error);
  }
  return false;
};
