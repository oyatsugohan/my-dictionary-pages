import streamlit as st
import json
import sqlite3
import hashlib
import base64
from datetime import datetime
from io import BytesIO
from PIL import Image
import os
import re

# ─────────────────────────────────────────────
# 定数・DB設定
# ─────────────────────────────────────────────
_SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__)) if "__file__" in dir() else os.getcwd()
DB_FILE = os.environ.get("ENCYCLOPEDIA_DB_PATH", os.path.join(_SCRIPT_DIR, "encyclopedia.db"))
print(f"📂 DB保存先: {os.path.abspath(DB_FILE)}")

# 画像の最大表示幅（サムネイル用）
THUMBNAIL_MAX_WIDTH = 800

# ─────────────────────────────────────────────
# DB初期化・接続
# ─────────────────────────────────────────────
def init_db():
    try:
        conn = sqlite3.connect(DB_FILE, check_same_thread=False, timeout=10)
        c = conn.cursor()
        c.execute('''
            CREATE TABLE IF NOT EXISTS users (
                username TEXT PRIMARY KEY,
                password TEXT NOT NULL,
                created TEXT NOT NULL
            )
        ''')
        c.execute('''
            CREATE TABLE IF NOT EXISTS articles (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL,
                title TEXT NOT NULL,
                category TEXT,
                content TEXT,
                images TEXT,
                created TEXT NOT NULL,
                updated TEXT,
                FOREIGN KEY (username) REFERENCES users(username),
                UNIQUE(username, title)
            )
        ''')
        conn.commit()
        print(f"✅ データベース初期化成功: {os.path.abspath(DB_FILE)}")
        return conn
    except Exception as e:
        print(f"❌ データベース初期化エラー: {e}")
        st.error(f"データベース初期化エラー: {e}")
        return None

def get_db_connection():
    try:
        if "db_conn" in st.session_state and st.session_state.db_conn is not None:
            try:
                st.session_state.db_conn.execute("SELECT 1")
                return st.session_state.db_conn
            except Exception:
                try:
                    st.session_state.db_conn.close()
                except Exception:
                    pass
        st.session_state.db_conn = init_db()
        return st.session_state.db_conn
    except Exception as e:
        st.error(f"データベース接続エラー: {e}")
        return None

# ─────────────────────────────────────────────
# 認証
# ─────────────────────────────────────────────

# 【修正①】bcryptが使えない環境向けに hashlib.pbkdf2_hmac を使用。
#          SHA-256単体よりも総当たり攻撃に対して大幅に強化。
def hash_password(password: str, username: str) -> str:
    """PBKDF2-HMAC-SHA256でパスワードをハッシュ化する（ソルト = username）。"""
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        username.encode("utf-8"),   # ソルトとしてユーザー名を使用
        iterations=260_000,         # NIST推奨値（2023年）
    )
    return dk.hex()

def register_user(username: str, password: str) -> bool:
    conn = get_db_connection()
    if conn is None:
        return False
    try:
        c = conn.cursor()
        c.execute(
            "INSERT INTO users (username, password, created) VALUES (?, ?, ?)",
            (username, hash_password(password, username), datetime.now().strftime("%Y-%m-%d %H:%M:%S")),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    except Exception as e:
        st.error(f"ユーザー登録エラー: {e}")
        return False

def authenticate_user(username: str, password: str) -> bool:
    conn = get_db_connection()
    if conn is None:
        return False
    try:
        c = conn.cursor()
        c.execute("SELECT password FROM users WHERE username = ?", (username,))
        result = c.fetchone()
        if not result:
            return False

        stored_hash = result[0]
        new_hash = hash_password(password, username)

        # 新方式（PBKDF2）で照合
        if stored_hash == new_hash:
            return True

        # 旧方式（SHA-256 ソルトあり）の移行
        old_hash_salted = hashlib.sha256(f"{username}:{password}".encode()).hexdigest()
        # 旧方式（SHA-256 ソルトなし）の移行
        old_hash_plain = hashlib.sha256(password.encode()).hexdigest()

        if stored_hash in (old_hash_salted, old_hash_plain):
            c.execute("UPDATE users SET password = ? WHERE username = ?", (new_hash, username))
            conn.commit()
            print(f"🔄 パスワードをPBKDF2方式に移行: {username}")
            return True

        return False
    except Exception as e:
        st.error(f"認証エラー: {e}")
        return False

# ─────────────────────────────────────────────
# 画像ユーティリティ
# ─────────────────────────────────────────────

def encode_image(image_file) -> str | None:
    """アップロード済みファイルをBase64文字列に変換する。
    最大幅を THUMBNAIL_MAX_WIDTH に抑えてDBの肥大化を緩和する。"""
    if image_file is None:
        return None
    try:
        img = Image.open(image_file)
        if img.width > THUMBNAIL_MAX_WIDTH:
            ratio = THUMBNAIL_MAX_WIDTH / img.width
            img = img.resize(
                (THUMBNAIL_MAX_WIDTH, int(img.height * ratio)),
                Image.Resampling.LANCZOS,
            )
        buffered = BytesIO()
        fmt = img.format or "PNG"
        save_kwargs = {"format": fmt, "optimize": True}
        if fmt == "JPEG":
            save_kwargs["quality"] = 92
        img.save(buffered, **save_kwargs)
        return base64.b64encode(buffered.getvalue()).decode()
    except Exception as e:
        st.warning(f"画像の変換に失敗しました: {e}")
        return None

def decode_image(base64_string: str) -> Image.Image | None:
    if base64_string:
        try:
            return Image.open(BytesIO(base64.b64decode(base64_string)))
        except Exception:
            return None
    return None

# ─────────────────────────────────────────────
# テキストレンダリング
# ─────────────────────────────────────────────
_MARKER_PATTERNS = [
    (r"<yellow>(.*?)</yellow>",
     r'<mark style="background-color:#ffeb3b;padding:2px 4px;border-radius:3px;">\1</mark>'),
    (r"<green>(.*?)</green>",
     r'<mark style="background-color:#8bc34a;padding:2px 4px;border-radius:3px;">\1</mark>'),
    (r"<blue>(.*?)</blue>",
     r'<mark style="background-color:#03a9f4;color:white;padding:2px 4px;border-radius:3px;">\1</mark>'),
    (r"<red>(.*?)</red>",
     r'<mark style="background-color:#f44336;color:white;padding:2px 4px;border-radius:3px;">\1</mark>'),
]

def render_markers_to_html(text: str) -> str:
    for pattern, replacement in _MARKER_PATTERNS:
        text = re.sub(pattern, replacement, text, flags=re.DOTALL)
    text = text.replace("\n", "<br>")
    return text

def create_article_links(content: str, all_titles: list[str], current_title: str) -> str:
    """本文中に登場する他記事タイトルを太字にしてマーカー変換を適用する。"""
    linked = content
    sorted_titles = sorted(
        [t for t in all_titles if t != current_title],
        key=len,
        reverse=True,
    )
    for title in sorted_titles:
        linked = linked.replace(title, f"<strong>{title}</strong>")
    return render_markers_to_html(linked)

# ─────────────────────────────────────────────
# DB CRUD
# ─────────────────────────────────────────────
def get_user_encyclopedia(username: str) -> dict:
    conn = get_db_connection()
    if conn is None:
        return {}
    try:
        c = conn.cursor()
        c.execute(
            "SELECT title, category, content, images, created, updated FROM articles WHERE username = ?",
            (username,),
        )
        encyclopedia = {}
        for title, category, content, images, created, updated in c.fetchall():
            encyclopedia[title] = {
                "category": json.loads(category) if category else ["未分類"],
                "content": content or "",
                "images": json.loads(images) if images else [],
                "created": created,
                "updated": updated,
            }
        return encyclopedia
    except Exception as e:
        st.error(f"記事取得エラー: {e}")
        return {}

def save_article(
    username: str,
    title: str,
    category: list[str],
    content: str,
    images: list[str],
    created: str | None = None,
) -> bool:
    conn = get_db_connection()
    if conn is None:
        return False
    try:
        c = conn.cursor()
        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        created = created or now
        try:
            c.execute(
                "INSERT INTO articles (username, title, category, content, images, created, updated) VALUES (?,?,?,?,?,?,?)",
                (username, title,
                 json.dumps(category, ensure_ascii=False),
                 content,
                 json.dumps(images, ensure_ascii=False),
                 created, now),
            )
        except sqlite3.IntegrityError:
            c.execute(
                "UPDATE articles SET category=?, content=?, images=?, updated=? WHERE username=? AND title=?",
                (json.dumps(category, ensure_ascii=False),
                 content,
                 json.dumps(images, ensure_ascii=False),
                 now, username, title),
            )
        conn.commit()
        return True
    except Exception as e:
        st.error(f"記事保存エラー: {e}")
        return False

def delete_article(username: str, title: str) -> bool:
    conn = get_db_connection()
    if conn is None:
        return False
    try:
        c = conn.cursor()
        c.execute("DELETE FROM articles WHERE username=? AND title=?", (username, title))
        conn.commit()
        return True
    except Exception as e:
        st.error(f"記事削除エラー: {e}")
        return False

# ─────────────────────────────────────────────
# バックアップ・リストア
# ─────────────────────────────────────────────
def backup_database() -> str | None:
    if not os.path.exists(DB_FILE):
        return None
    import shutil
    backup_file = os.path.expanduser(
        f"~/encyclopedia_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
    )
    shutil.copy(DB_FILE, backup_file)
    return backup_file

def find_backup_files() -> list[dict]:
    home_dir = os.path.expanduser("~")
    backups = []
    try:
        for name in os.listdir(home_dir):
            if name.startswith("encyclopedia_backup_") and name.endswith(".db"):
                full = os.path.join(home_dir, name)
                backups.append({
                    "name": name,
                    "path": full,
                    "size": os.path.getsize(full),
                    "modified": datetime.fromtimestamp(os.path.getmtime(full)),
                })
    except Exception:
        pass
    return sorted(backups, key=lambda x: x["modified"], reverse=True)

def restore_from_backup(backup_path: str) -> bool:
    import shutil
    try:
        if os.path.exists(DB_FILE):
            temp = os.path.expanduser(
                f"~/encyclopedia_before_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
            )
            shutil.copy(DB_FILE, temp)
        shutil.copy(backup_path, DB_FILE)
        if "db_conn" in st.session_state:
            try:
                st.session_state.db_conn.close()
            except Exception:
                pass
            del st.session_state.db_conn
        return True
    except Exception as e:
        st.error(f"復元エラー: {e}")
        return False

# ─────────────────────────────────────────────
# ヘルパー：カテゴリー文字列 → リスト
# ─────────────────────────────────────────────
def parse_categories(text: str) -> list[str]:
    cats = [c.strip() for c in text.split(",") if c.strip()]
    return cats or ["未分類"]

def categories_to_str(cats) -> str:
    if isinstance(cats, list):
        return ", ".join(cats)
    return cats or ""

def collect_all_categories(encyclopedia: dict) -> list[str]:
    cats: set[str] = set()
    for article in encyclopedia.values():
        c = article.get("category", ["未分類"])
        cats.update(c if isinstance(c, list) else [c])
    return sorted(cats)

# ─────────────────────────────────────────────
# ヘルパー：マーカーボタン UI
# ─────────────────────────────────────────────
def show_marker_buttons(key_prefix: str):
    """マーカー挿入ヒントボタンを表示し、クリックされたメッセージを返す。"""
    cols = st.columns(4)
    labels = [
        ("🟨 黄色マーカー", "<yellow>文字</yellow>"),
        ("🟩 緑マーカー",   "<green>文字</green>"),
        ("🟦 青マーカー",   "<blue>文字</blue>"),
        ("🟥 赤マーカー",   "<red>文字</red>"),
    ]
    for col, (label, tag) in zip(cols, labels):
        with col:
            if st.button(label, use_container_width=True, key=f"{key_prefix}_{label}"):
                st.info(f"囲みたい文字を `{tag}` の形式で入力してください")

# ─────────────────────────────────────────────
# アプリ設定
# ─────────────────────────────────────────────
st.set_page_config(page_title="オリジナル百科事典", page_icon="📚", layout="wide")

st.markdown("""
<style>
    [data-testid="column"] img { max-width: 200px; height: auto; }
    [data-testid="StyledFullScreenFrame"] img { max-width:100%!important; width:auto!important; height:auto!important; }
</style>
""", unsafe_allow_html=True)

# ─────────────────────────────────────────────
# セッション初期化
# ─────────────────────────────────────────────
if "db_initialized" not in st.session_state:
    conn = init_db()
    if conn:
        st.session_state.db_conn = conn
        st.session_state.db_initialized = True

for key, default in [
    ("logged_in", False),
    ("username", None),
    ("encyclopedia", {}),
    ("selected_article", None),
]:
    if key not in st.session_state:
        st.session_state[key] = default

# ─────────────────────────────────────────────
# 未ログイン画面
# ─────────────────────────────────────────────
if not st.session_state.logged_in:
    st.title("📚 オリジナル百科事典")
    st.markdown("---")

    db_abs_path = os.path.abspath(DB_FILE)
    st.markdown("#### ℹ️ システム情報")
    st.info(f"**データベースの保存場所**: `{db_abs_path}`")
    if os.path.exists(DB_FILE):
        file_size = os.path.getsize(DB_FILE) / 1024
        st.success(f"✅ データベースが見つかりました（サイズ: {file_size:.2f} KB）　💾 データは永続的に保存されます！")
    else:
        st.warning("⚠️ データベースファイルが見つかりません。ログイン後に自動作成されます。")

    backup_files = find_backup_files()
    if backup_files:
        st.markdown("---")
        st.success(f"🔍 **{len(backup_files)}件のバックアップファイルが見つかりました**")
        options = ["復元しない"] + [
            f"{b['name']} ({b['modified'].strftime('%Y-%m-%d %H:%M:%S')}, {b['size']/1024:.2f} KB)"
            for b in backup_files
        ]
        selected_backup = st.selectbox("復元するバックアップを選択（任意）", options=options)
        if selected_backup != "復元しない":
            idx = options.index(selected_backup) - 1
            st.warning(f"⚠️ 「{backup_files[idx]['name']}」から復元しますか？現在のDBは自動バックアップされます。")
            if st.button("🔄 復元を実行", type="primary"):
                if restore_from_backup(backup_files[idx]["path"]):
                    st.success("✅ 復元完了！ページを再読み込みしてください。")
                    st.balloons()
                    st.rerun()
                else:
                    st.error("復元に失敗しました。")

    tab1, tab2 = st.tabs(["🔐 ログイン", "✍️ 新規登録"])

    with tab1:
        st.header("ログイン")
        with st.form("login_form"):
            username = st.text_input("ユーザー名")
            password = st.text_input("パスワード", type="password")
            if st.form_submit_button("ログイン"):
                if authenticate_user(username, password):
                    st.session_state.logged_in = True
                    st.session_state.username = username
                    st.session_state.encyclopedia = get_user_encyclopedia(username)
                    st.success(f"ようこそ、{username}さん！")
                    st.rerun()
                else:
                    st.error("ユーザー名またはパスワードが間違っています")

    with tab2:
        st.header("新規登録")
        with st.form("signup_form"):
            new_username = st.text_input("ユーザー名（半角英数字推奨）")
            new_password = st.text_input("パスワード", type="password")
            confirm_password = st.text_input("パスワード（確認）", type="password")
            if st.form_submit_button("登録"):
                if not new_username or not new_password:
                    st.error("ユーザー名とパスワードを入力してください")
                elif new_password != confirm_password:
                    st.error("パスワードが一致しません")
                elif len(new_password) < 4:
                    st.error("パスワードは4文字以上で設定してください")
                elif register_user(new_username, new_password):
                    st.success("登録完了！ログインしてください。")
                else:
                    st.error("このユーザー名は既に使用されています")

# ─────────────────────────────────────────────
# ログイン後メイン画面
# ─────────────────────────────────────────────
else:
    col_title, col_backup, col_logout = st.columns([3, 1, 1])
    with col_title:
        st.title(f"📚 {st.session_state.username}の百科事典")
    with col_backup:
        if st.button("💾 バックアップ"):
            path = backup_database()
            if path:
                st.success("バックアップ完了！")
                st.caption(os.path.basename(path))
    with col_logout:
        if st.button("🚪 ログアウト"):
            for key in ("logged_in", "username", "encyclopedia", "selected_article"):
                st.session_state[key] = (False if key == "logged_in" else None if key != "encyclopedia" else {})
            st.rerun()

    st.markdown("---")
    st.info(
        "📖 このアプリは **自分だけの百科事典** を作れる「オリジナル百科事典」です！　"
        "気になることや覚えておきたいことを記事としてまとめ、画像やカラーマーカーで自由にカスタマイズできます。"
        "まずは左のメニューから ➕ **新規記事作成** を試してみましょう！"
    )
    st.markdown("---")

    # ─── サイドバー ───────────────────────────
    with st.sidebar:
        st.header("メニュー")
        menu = st.radio(
            "機能を選択",
            ["🔍 記事を検索", "➕ 新規記事作成", "📝 記事を編集", "🗑️ 記事を削除", "📊 統計情報"],
        )
        st.markdown("---")
        st.markdown("**💾 データベース情報**")
        st.caption(f"保存先: {os.path.abspath(DB_FILE)}")
        if os.path.exists(DB_FILE):
            st.caption(f"サイズ: {os.path.getsize(DB_FILE)/1024:.2f} KB　✅ 保存済み")

        if st.checkbox("📖 登録済み記事一覧を表示", value=True):
            enc = get_user_encyclopedia(st.session_state.username)
            if enc:
                for title in sorted(enc.keys()):
                    st.text(f"• {title}")
            else:
                st.info("まだ記事がありません")

    # ─────────────────────────────────────────
    # 🔍 記事を検索
    # ─────────────────────────────────────────
    if menu == "🔍 記事を検索":
        st.header("記事を検索")
        enc = get_user_encyclopedia(st.session_state.username)
        st.session_state.encyclopedia = enc

        if not enc:
            st.info("まだ記事がありません。「新規記事作成」から記事を追加してください。")
        else:
            all_categories = collect_all_categories(enc)
            col1, col2 = st.columns(2)
            with col1:
                search_term = st.text_input("🔎 検索キーワードを入力", placeholder="記事のタイトルで検索")
            with col2:
                selected_category = st.selectbox("🏷️ カテゴリーで絞り込み", ["すべて"] + all_categories)

            results = {
                k: v for k, v in enc.items()
                if (not search_term or search_term.lower() in k.lower())
                and (selected_category == "すべて"
                     or selected_category in (v.get("category", ["未分類"])
                                              if isinstance(v.get("category", []), list)
                                              else [v.get("category", "未分類")]))
            }

            if not results:
                st.warning("該当する記事が見つかりませんでした")
            else:
                st.success(f"{len(results)}件の記事が見つかりました")
                st.markdown("### 📋 記事一覧")
                cols = st.columns(3)
                for idx, title in enumerate(sorted(results.keys())):
                    with cols[idx % 3]:
                        if st.button(f"📄 {title}", key=f"article_btn_{title}", use_container_width=True):
                            st.session_state.selected_article = title

                sel = st.session_state.selected_article
                if sel and sel in enc:
                    st.markdown("---")
                    st.markdown(f"## 📖 {sel}")
                    data = enc[sel]
                    st.markdown(f"**カテゴリー:** {categories_to_str(data.get('category', ['未分類']))}")
                    st.markdown(f"**作成日:** {data.get('created', '不明')}")
                    if data.get("updated"):
                        st.markdown(f"**更新日:** {data['updated']}")

                    images = data.get("images", [])
                    if images:
                        st.markdown("**📷 画像:**")
                        img_cols = st.columns(min(len(images), 3))
                        for i, img_data in enumerate(images):
                            img = decode_image(img_data)
                            if img:
                                with img_cols[i % 3]:
                                    st.image(img, caption=f"画像 {i+1}")

                    st.markdown("---")
                    st.markdown("### 本文")
                    st.markdown(
                        create_article_links(data.get("content", ""), list(enc.keys()), sel),
                        unsafe_allow_html=True,
                    )

                    st.markdown("---")
                    st.markdown("### 🔗 本文中で言及されている記事")
                    mentioned = [t for t in enc if t != sel and t in data.get("content", "")]
                    if mentioned:
                        link_cols = st.columns(min(len(mentioned), 4))
                        for i, m_title in enumerate(mentioned):
                            with link_cols[i % len(link_cols)]:
                                if st.button(f"➡️ {m_title}", key=f"link_{m_title}", use_container_width=True):
                                    st.session_state.selected_article = m_title
                                    st.rerun()
                    else:
                        st.info("この記事では他の記事への言及はありません")

    # ─────────────────────────────────────────
    # ➕ 新規記事作成
    # ─────────────────────────────────────────
    elif menu == "➕ 新規記事作成":
        st.header("新規記事作成")

        # 【修正②】保存成功後にフォームをリセットするためのキーを管理する
        if "new_article_form_key" not in st.session_state:
            st.session_state.new_article_form_key = 0
        form_key = st.session_state.new_article_form_key

        title = st.text_input("📝 記事タイトル", placeholder="例: Python", key=f"new_title_{form_key}")
        category = st.text_input(
            "🏷️ カテゴリー",
            placeholder="例: プログラミング言語, 技術（カンマ区切りで複数指定可能）",
            key=f"new_cat_{form_key}",
        )
        uploaded_images = st.file_uploader(
            "🖼️ 画像を追加（任意・複数選択可）",
            type=["png", "jpg", "jpeg", "gif", "webp"],
            accept_multiple_files=True,
            key=f"new_imgs_{form_key}",
        )
        if uploaded_images:
            st.write(f"**選択された画像: {len(uploaded_images)}枚**")
            prev_cols = st.columns(min(len(uploaded_images), 3))
            for i, f in enumerate(uploaded_images):
                with prev_cols[i % 3]:
                    st.image(f, caption=f"画像 {i+1}", width=150)

        st.markdown("### ✍️ 記事内容")
        st.markdown("**🖍️ マーカーを挿入:**")
        show_marker_buttons("new")

        with st.expander("📖 マーカーの使い方詳細"):
            st.markdown("""
文章中でマーカーを引きたい部分を以下のタグで囲んでください：
- 黄色: `<yellow>重要な文字</yellow>`
- 緑色: `<green>良い点</green>`
- 青色: `<blue>注意点</blue>`
- 赤色: `<red>警告</red>`
""")
            example = "Pythonは<yellow>人気のプログラミング言語</yellow>です。<green>初心者にも優しく</green>、多くの用途があります。ただし<red>セキュリティには注意</red>が必要です。"
            st.markdown(render_markers_to_html(example), unsafe_allow_html=True)

        content = st.text_area(
            "記事本文を入力",
            height=300,
            placeholder="記事の内容を入力してください...\n\nマーカーの使い方:\n<yellow>黄色</yellow>\n<green>緑</green>\n<blue>青</blue>\n<red>赤</red>",
            key=f"new_content_{form_key}",
        )
        if content:
            st.markdown("---")
            st.markdown("### 👁️ プレビュー")
            st.markdown(render_markers_to_html(content), unsafe_allow_html=True)

        if st.button("✅ 記事を保存", type="primary", use_container_width=True):
            enc = get_user_encyclopedia(st.session_state.username)
            if not title:
                st.error("タイトルを入力してください")
            elif title in enc:
                st.error("同じタイトルの記事が既に存在します")
            elif not content:
                st.error("記事内容を入力してください")
            else:
                images_data = []
                for img_file in (uploaded_images or []):
                    img_file.seek(0)
                    encoded = encode_image(img_file)
                    if encoded:
                        images_data.append(encoded)

                if save_article(st.session_state.username, title, parse_categories(category), content, images_data):
                    st.session_state.encyclopedia = get_user_encyclopedia(st.session_state.username)
                    # 【修正②】フォームキーをインクリメントして全入力欄をリセット
                    st.session_state.new_article_form_key += 1
                    st.success(f"✅ 記事「{title}」を保存しました！")
                    st.balloons()
                    st.rerun()
                else:
                    st.error("記事の保存に失敗しました")

    # ─────────────────────────────────────────
    # 📝 記事を編集
    # ─────────────────────────────────────────
    elif menu == "📝 記事を編集":
        st.header("記事を編集")
        enc = get_user_encyclopedia(st.session_state.username)
        st.session_state.encyclopedia = enc

        if not enc:
            st.info("編集する記事がありません")
        else:
            col1, col2 = st.columns(2)
            with col1:
                search_edit = st.text_input("🔎 記事を検索", placeholder="タイトルで絞り込み", key="search_edit")
            with col2:
                all_categories = collect_all_categories(enc)
                category_filter = st.selectbox("🏷️ カテゴリーで絞り込み", ["すべて"] + all_categories, key="category_edit")

            filtered = [
                k for k in enc
                if (not search_edit or search_edit.lower() in k.lower())
                and (category_filter == "すべて"
                     or category_filter in (enc[k].get("category", ["未分類"])
                                            if isinstance(enc[k].get("category", []), list)
                                            else [enc[k].get("category", "未分類")]))
            ]

            if not filtered:
                st.warning("該当する記事が見つかりませんでした")
            else:
                if search_edit or category_filter != "すべて":
                    st.success(f"{len(filtered)}件の記事が見つかりました")

                article_to_edit = st.selectbox("編集する記事を選択", sorted(filtered))
                if article_to_edit:
                    current = enc[article_to_edit]
                    delete_key = f"images_to_delete_{article_to_edit}"
                    if delete_key not in st.session_state:
                        st.session_state[delete_key] = []

                    st.markdown("---")
                    st.subheader(f"📝 「{article_to_edit}」を編集中")
                    st.markdown("---")

                    new_title = st.text_input("📝 記事タイトル", value=article_to_edit, key=f"title_{article_to_edit}")
                    new_category = st.text_input(
                        "🏷️ カテゴリー",
                        value=categories_to_str(current.get("category", [])),
                        key=f"category_{article_to_edit}",
                    )

                    existing_images = current.get("images", [])
                    if existing_images:
                        st.markdown("### 🖼️ 現在の画像")
                        st.write(f"**登録済み画像: {len(existing_images)}枚**")
                        img_cols = st.columns(min(len(existing_images), 3))
                        for i, img_data in enumerate(existing_images):
                            img = decode_image(img_data)
                            if img:
                                with img_cols[i % 3]:
                                    st.image(img, caption=f"画像 {i+1}")
                                    checked = st.checkbox(
                                        "🗑️ 削除",
                                        key=f"del_img_{article_to_edit}_{i}",
                                        value=(i in st.session_state[delete_key]),
                                    )
                                    if checked and i not in st.session_state[delete_key]:
                                        st.session_state[delete_key].append(i)
                                    elif not checked and i in st.session_state[delete_key]:
                                        st.session_state[delete_key].remove(i)
                        if st.session_state[delete_key]:
                            st.warning(f"⚠️ {len(st.session_state[delete_key])}枚の画像が削除予定です")

                    st.markdown("---")
                    st.markdown("### ➕ 新しい画像を追加")
                    uploaded_images = st.file_uploader(
                        "🖼️ 画像を追加（複数選択可）",
                        type=["png", "jpg", "jpeg", "gif", "webp"],
                        accept_multiple_files=True,
                        key=f"edit_images_{article_to_edit}",
                    )
                    if uploaded_images:
                        st.write(f"**追加する画像: {len(uploaded_images)}枚**")
                        new_img_cols = st.columns(min(len(uploaded_images), 3))
                        for i, f in enumerate(uploaded_images):
                            with new_img_cols[i % 3]:
                                st.image(f, caption=f"新しい画像 {i+1}")

                    # 【修正③】「すべての画像を削除」チェックボックスを保存処理に正しく反映
                    delete_all_images = st.checkbox(
                        "🗑️ すべての画像を削除する",
                        key=f"delete_all_img_{article_to_edit}",
                    )

                    st.markdown("### ✍️ 記事内容を編集")
                    st.markdown("**🖍️ マーカーを挿入:**")
                    show_marker_buttons(f"edit_{article_to_edit}")

                    new_content = st.text_area(
                        "記事本文",
                        value=current.get("content", ""),
                        height=300,
                        key=f"edit_content_{article_to_edit}",
                    )
                    if new_content:
                        st.markdown("---")
                        st.markdown("### 👁️ プレビュー")
                        st.markdown(render_markers_to_html(new_content), unsafe_allow_html=True)

                    if st.button("💾 更新を保存", type="primary", use_container_width=True, key=f"save_{article_to_edit}"):
                        if not new_title:
                            st.error("タイトルを入力してください")
                        elif not new_content:
                            st.error("記事内容を入力してください")
                        else:
                            # 【修正③】delete_all_images フラグを保存処理に反映
                            if delete_all_images:
                                images_data = []
                            else:
                                images_data = [
                                    img for i, img in enumerate(existing_images)
                                    if i not in st.session_state[delete_key]
                                ]

                            for img_file in (uploaded_images or []):
                                img_file.seek(0)
                                encoded = encode_image(img_file)
                                if encoded:
                                    images_data.append(encoded)

                            if new_title != article_to_edit:
                                delete_article(st.session_state.username, article_to_edit)

                            if save_article(
                                st.session_state.username,
                                new_title,
                                parse_categories(new_category),
                                new_content,
                                images_data,
                                created=current.get("created"),
                            ):
                                st.session_state.encyclopedia = get_user_encyclopedia(st.session_state.username)
                                st.session_state[delete_key] = []
                                st.success(f"✅ 記事「{new_title}」を更新しました！")
                                st.rerun()
                            else:
                                st.error("記事の更新に失敗しました")

    # ─────────────────────────────────────────
    # 🗑️ 記事を削除
    # ─────────────────────────────────────────
    elif menu == "🗑️ 記事を削除":
        st.header("記事を削除")
        enc = get_user_encyclopedia(st.session_state.username)
        st.session_state.encyclopedia = enc

        if not enc:
            st.info("削除する記事がありません")
        else:
            article_to_delete = st.selectbox("削除する記事を選択", sorted(enc.keys()))
            if article_to_delete:
                st.warning(f"本当に「{article_to_delete}」を削除しますか？")
                preview = enc[article_to_delete]
                preview_images = preview.get("images", [])
                if preview_images:
                    st.write(f"**この記事の画像（{len(preview_images)}枚）も削除されます:**")
                    del_cols = st.columns(min(len(preview_images), 3))
                    for i, img_data in enumerate(preview_images):
                        img = decode_image(img_data)
                        if img:
                            with del_cols[i % 3]:
                                st.image(img, caption=f"画像 {i+1}", width=150)

                col1, _ = st.columns([1, 4])
                with col1:
                    if st.button("🗑️ 削除", type="primary"):
                        if delete_article(st.session_state.username, article_to_delete):
                            st.session_state.encyclopedia = get_user_encyclopedia(st.session_state.username)
                            st.success(f"記事「{article_to_delete}」を削除しました")
                            st.rerun()
                        else:
                            st.error("削除に失敗しました")

    # ─────────────────────────────────────────
    # 📊 統計情報
    # ─────────────────────────────────────────
    elif menu == "📊 統計情報":
        st.header("統計情報")
        enc = get_user_encyclopedia(st.session_state.username)
        st.session_state.encyclopedia = enc

        if not enc:
            st.info("まだ記事がありません")
        else:
            col1, col2, col3, col4 = st.columns(4)
            with col1:
                st.metric("📚 総記事数", len(enc))
            with col2:
                st.metric("🏷️ カテゴリー数", len(collect_all_categories(enc)))
            with col3:
                total_chars = sum(len(v.get("content", "")) for v in enc.values())
                st.metric("✍️ 総文字数", f"{total_chars:,}")
            with col4:
                total_images = sum(len(v.get("images", [])) for v in enc.values())
                articles_with_images = sum(1 for v in enc.values() if v.get("images"))
                st.metric("🖼️ 総画像数", total_images)
                st.caption(f"画像付き記事: {articles_with_images}件")

            st.markdown("---")
            st.subheader("カテゴリー別記事数")
            category_count: dict[str, int] = {}
            for article in enc.values():
                cats = article.get("category", ["未分類"])
                for cat in (cats if isinstance(cats, list) else [cats]):
                    category_count[cat] = category_count.get(cat, 0) + 1
            for cat, count in sorted(category_count.items(), key=lambda x: x[1], reverse=True):
                st.write(f"**{cat}**: {count}件")

    st.markdown("---")
    st.markdown("💡 **ヒント**: マーカーを使うには `<yellow>文字</yellow>` のように囲んでください！")