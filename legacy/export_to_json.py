import sqlite3
import json
import os
import sys

def main():
    # Streamlit アプリケーションが使用していた SQLite データベースファイルのパスを取得
    legacy_dir = os.path.dirname(os.path.abspath(__file__))
    db_path = os.path.join(legacy_dir, "encyclopedia.db")
    
    if not os.path.exists(db_path):
        print(f"Error: データベースファイルが次の場所に見つかりません: {db_path}")
        print("Streamlit アプリケーションで作成された `encyclopedia.db` ファイルを `legacy/` フォルダ配下に配置してから実行してください。")
        sys.exit(1)

    print(f"📂 移行元データベースを読み込んでいます: {db_path}")
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()

    try:
        # 保存されている記事から一意のユーザー名を取得
        cursor.execute("SELECT DISTINCT username FROM articles")
        users = [row[0] for row in cursor.fetchall()]
        
        if not users:
            print("⚠️ データベース内に記事またはユーザーが見つかりません。")
            sys.exit(0)
            
        print(f"👤 検出されたユーザー: {', '.join(users)}")
        
        # データベースからすべての記事を抽出
        cursor.execute("SELECT title, category, content, images, created, updated, username FROM articles")
        rows = cursor.fetchall()
        
        articles = []
        for row in rows:
            title, category_str, content, images_str, created, updated, username = row
            
            # カテゴリーをリスト形式に変換
            try:
                category = json.loads(category_str) if category_str else ["未分類"]
                if not isinstance(category, list):
                    category = [str(category)]
            except Exception:
                # JSONとしてパースできない場合はカンマなどで分割
                if category_str:
                    category = [c.strip() for c in category_str.split(",") if c.strip()]
                else:
                    category = ["未分類"]
                
            # 画像データをBase64文字列の配列に復元
            try:
                images = json.loads(images_str) if images_str else []
                if not isinstance(images, list):
                    images = []
            except Exception:
                images = []
                
            article = {
                "title": title,
                "category": category,
                "content": content or "",
                "images": images,
                "created": created or "",
                "updated": updated or None
            }
            articles.append(article)
            
        # React アプリが「復元」から読み込める JSON バックアップファイルをワークスペースのルートに生成
        output_file = os.path.join(os.path.dirname(legacy_dir), "legacy_backup.json")
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(articles, f, ensure_ascii=False, indent=2)
            
        print("=" * 60)
        print(f"🎉 移行用データの作成に成功しました！")
        print(f"💾 出力先: {output_file} (計 {len(articles)} 件の記事)")
        print("=" * 60)
        print("💡 次の手順でReactアプリにデータを引き継いでください：")
        print("1. 新しい React アプリの画面を開きます。")
        print("2. 画面上部またはメニューの「☁️ 復元」 (Uploadアイコン) ボタンをクリックします。")
        print("3. このスクリプトが作成した `legacy_backup.json` ファイルを選択します。")
        print("4. これで、これまでに書いたすべての辞書データが IndexedDB にインポートされます！")
        print("=" * 60)

    except Exception as e:
        print(f"❌ 移行データの作成中にエラーが発生しました: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()
