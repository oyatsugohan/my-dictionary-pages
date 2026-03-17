import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Book, Search, PlusCircle, Edit3, Trash2, BarChart2, Save, Download, Upload, Image as ImageIcon, User, Cloud, CloudOff } from 'lucide-react';
import { type AccountInfo } from '@azure/msal-browser';
import { db } from './db';
import { createLinks } from './utils';
import { msalInstance, loginRequest, syncToOneDrive, loadFromOneDrive, ensureInitialized } from './auth';
import './App.css';

type Menu = 'search' | 'create' | 'edit' | 'delete' | 'stats';

function App() {
  const [activeMenu, setActiveMenu] = useState<Menu>('search');
  const [titleSearch, setTitleSearch] = useState('');
  const [categorySearch, setCategorySearch] = useState('すべて');
  const [selectedArticleId, setSelectedArticleId] = useState<number | null>(null);
  const [editArticleId, setEditArticleId] = useState<number | null>(null);
  const [userAccount, setUserAccount] = useState<AccountInfo | null>(null);
  const [syncing, setSyncing] = useState(false);
  
  // Form states
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [content, setContent] = useState('');
  const [images, setImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  const articles = useLiveQuery(() => db.articles.toArray()) || [];
  const allTitles = articles.map(a => a.title);
  
  // Extract unique categories for search dropdown
  const uniqueCategories = Array.from(new Set(articles.flatMap(a => a.category))).sort();

  // Handle MSAL Authentication State
  useEffect(() => {
    const checkAccount = async () => {
      try {
        await ensureInitialized();
        const response = await msalInstance.handleRedirectPromise();
        if (response) {
          setUserAccount(response.account);
        } else {
          const accounts = msalInstance.getAllAccounts();
          if (accounts.length > 0) {
            setUserAccount(accounts[0]);
          }
        }
      } catch (e) {
        console.error("Auth Error", e);
      }
    };
    checkAccount();
  }, []);

  // Sync from Cloud on Login
  useEffect(() => {
    if (userAccount) {
      loadFromOneDrive().then(updated => {
        if (updated) console.log("Cloud data loaded");
      });
    }
  }, [userAccount]);

  // Sync to Cloud after DB change (Debounced or triggered manually/on save)
  const triggerSync = async () => {
    if (userAccount) {
      setSyncing(true);
      await syncToOneDrive();
      setSyncing(false);
    }
  };

  const handleLogin = async () => {
    await ensureInitialized();
    msalInstance.loginRedirect(loginRequest);
  };

  const handleLogout = async () => {
    await ensureInitialized();
    msalInstance.logoutRedirect();
  };

  // Sync edit form when editArticleId changes
  useEffect(() => {
    if (editArticleId) {
      const art = articles.find(a => a.id === editArticleId);
      if (art) {
        setTitle(art.title);
        setCategory(art.category.join(', '));
        setContent(art.content);
        setImages(art.images);
      }
    } else {
      setTitle('');
      setCategory('');
      setContent('');
      setImages([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editArticleId]); // Remove 'articles' from dependency to avoid cascading renders

  const handleSave = async () => {
    if (!title || !content) {
      alert('タイトルと内容を入力してください');
      return;
    }

    const categories = category.split(',').map(c => c.trim()).filter(c => c !== '');
    const now = new Date().toLocaleString();

    if (editArticleId) {
      await db.articles.update(editArticleId, {
        title,
        category: categories.length > 0 ? categories : ['未分類'],
        content,
        images,
        updated: now
      });
      alert('更新しました');
      setEditArticleId(null);
      setActiveMenu('search');
    } else {
      const existing = await db.articles.where('title').equals(title).first();
      if (existing) {
        alert('同じタイトルの記事が既に存在します');
        return;
      }
      await db.articles.add({
        title,
        category: categories.length > 0 ? categories : ['未分類'],
        content,
        images,
        created: now
      });
      alert('保存しました');
      setTitle('');
      setCategory('');
      setContent('');
      setImages([]);
      setActiveMenu('search');
    }
    
    // Auto sync to cloud
    await triggerSync();
  };

  const handleDelete = async (id: number) => {
    if (confirm('本当に削除しますか？')) {
      await db.articles.delete(id);
      if (selectedArticleId === id) setSelectedArticleId(null);
      await triggerSync();
    }
  };

  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    Array.from(files).forEach(file => {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onloadend = () => {
        setImages(prev => [...prev, reader.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const handleUrlDrop = async (html: string) => {
    const match = html.match(/src="([^"]+)"/);
    if (match && match[1]) {
      const url = match[1];
      try {
        const response = await fetch(url);
        const blob = await response.blob();
        const reader = new FileReader();
        reader.onloadend = () => {
          setImages(prev => [...prev, reader.result as string]);
        };
        reader.readAsDataURL(blob);
      } catch (err) {
        console.error("URL drop failed", err);
        alert("外部サイトの画像を取り込めませんでした。サイトの制限により直接のコピーが禁止されている場合があります。一度パソコンに保存してからドラッグ＆ドロップしてください。");
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    handleFiles(e.target.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    // Only stop dragging if we leave the window
    if (e.currentTarget === e.target) {
      setIsDragging(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    // Switch to create menu if not in create or edit mode
    if (activeMenu !== 'create' && activeMenu !== 'edit') {
      setActiveMenu('create');
      setEditArticleId(null);
    }

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    } else {
      const html = e.dataTransfer.getData('text/html');
      if (html) {
        handleUrlDrop(html);
      }
    }
  };

  const exportData = () => {
    const data = JSON.stringify(articles, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `encyclopedia_backup_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  };

  const importData = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target?.result as string);
          if (Array.isArray(data)) {
            // Simple validation: check if it looks like articles
            for (const item of data) {
              if (item.title && item.content) {
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
                const { id, ...rest } = item; // remove old ID
                await db.articles.add(rest);
              }
            }
            alert('インポート完了しました');
            await triggerSync();
          }
        } catch {
          alert('インポートに失敗しました。ファイル形式を確認してください。');
        }
      };
      reader.readAsText(file);
    }
  };

  const insertMarker = (color: string) => {
    const textarea = document.getElementById('content-area') as HTMLTextAreaElement;
    if (!textarea) return;
    
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    const before = text.substring(0, start);
    const selected = text.substring(start, end);
    const after = text.substring(end);
    
    const newContent = `${before}<${color}>${selected}</${color}>${after}`;
    setContent(newContent);
    
    // Reset focus and selection
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + color.length + 2, end + color.length + 2);
    }, 0);
  };

  const filteredArticles = articles.filter(a => {
    const matchesTitle = a.title.toLowerCase().includes(titleSearch.toLowerCase());
    const matchesCategory = categorySearch === 'すべて' || a.category.includes(categorySearch);
    return matchesTitle && matchesCategory;
  });

  return (
    <div 
      className="app-container" 
      onDragOver={handleDragOver} 
      onDragLeave={handleDragLeave} 
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-message">
            <ImageIcon size={48} />
            <p>画像をドロップして追加</p>
          </div>
        </div>
      )}
      <aside className="sidebar">
        <h1><Book /> 百科事典</h1>
        
        {userAccount ? (
          <div style={{ marginBottom: '1.5rem', padding: '0.5rem', background: '#f0f4f8', borderRadius: '8px', fontSize: '0.9rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              <User size={16} /> <strong>{userAccount.name}</strong>
            </div>
            <div style={{ fontSize: '0.8rem', color: syncing ? 'blue' : 'green', display: 'flex', alignItems: 'center', gap: '5px' }}>
              {syncing ? <Cloud size={14} className="animate-pulse" /> : <Cloud size={14} />} 
              {syncing ? '同期中...' : 'OneDrive同期済み'}
            </div>
            <button onClick={handleLogout} className="btn" style={{ fontSize: '0.8rem', marginTop: '0.5rem', padding: '2px 8px', width: '100%' }}>
              ログアウト
            </button>
          </div>
        ) : (
          <button onClick={handleLogin} className="nav-item" style={{ marginBottom: '1.5rem', background: '#00a4ef', color: 'white' }}>
            <CloudOff size={20} /> MSアカウントでログイン
          </button>
        )}

        <nav className="nav-menu">
          <button className={`nav-item ${activeMenu === 'search' ? 'active' : ''}`} onClick={() => setActiveMenu('search')}>
            <Search size={20} /> 記事を検索
          </button>
          <button className={`nav-item ${activeMenu === 'create' ? 'active' : ''}`} onClick={() => { setActiveMenu('create'); setEditArticleId(null); }}>
            <PlusCircle size={20} /> 新規記事作成
          </button>
          <button className={`nav-item ${activeMenu === 'edit' ? 'active' : ''}`} onClick={() => setActiveMenu('edit')}>
            <Edit3 size={20} /> 記事を編集
          </button>
          <button className={`nav-item ${activeMenu === 'delete' ? 'active' : ''}`} onClick={() => setActiveMenu('delete')}>
            <Trash2 size={20} /> 記事を削除
          </button>
          <button className={`nav-item ${activeMenu === 'stats' ? 'active' : ''}`} onClick={() => setActiveMenu('stats')}>
            <BarChart2 size={20} /> 統計情報
          </button>
        </nav>
        
        <div style={{ marginTop: 'auto', paddingTop: '1rem', borderTop: '1px solid var(--border-color)' }}>
          <button className="nav-item" onClick={exportData} title="JSON形式でエクスポート">
            <Download size={20} /> バックアップ
          </button>
          <label className="nav-item" style={{ cursor: 'pointer' }} title="JSON形式からインポート">
            <Upload size={20} /> 復元
            <input type="file" accept=".json" onChange={importData} style={{ display: 'none' }} />
          </label>
        </div>
      </aside>

      <main className="main-content">
        <div className="container">
          {activeMenu === 'search' && (
            <div>
              <h2>🔍 記事を検索</h2>
              <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                <div style={{ flex: 2 }}>
                  <label style={{ fontSize: '0.85rem', color: '#666', display: 'block', marginBottom: '0.25rem' }}>タイトルで検索</label>
                  <input 
                    type="text" 
                    placeholder="例: Python..." 
                    value={titleSearch}
                    onChange={(e) => setTitleSearch(e.target.value)}
                  />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: '0.85rem', color: '#666', display: 'block', marginBottom: '0.25rem' }}>カテゴリーで絞り込み</label>
                  <select 
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    style={{ width: '100%', padding: '0.75rem', borderRadius: '4px', border: '1px solid var(--border-color)', fontSize: '1rem' }}
                  >
                    <option value="すべて">すべて</option>
                    {uniqueCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              {selectedArticleId ? (
                <div className="article-view">
                  <button onClick={() => setSelectedArticleId(null)} className="btn">← 戻る</button>
                  {articles.find(a => a.id === selectedArticleId) && (
                    <article>
                      <h1 style={{ borderBottom: '2px solid var(--primary-color)', paddingBottom: '0.5rem' }}>
                        {articles.find(a => a.id === selectedArticleId)?.title}
                      </h1>
                      <div style={{ color: '#666', marginBottom: '1rem' }}>
                        カテゴリー: {articles.find(a => a.id === selectedArticleId)?.category.join(', ')} | 
                        作成: {articles.find(a => a.id === selectedArticleId)?.created}
                      </div>
                      
                      <div className="article-images" style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                        {articles.find(a => a.id === selectedArticleId)?.images.map((img, i) => (
                          <img key={i} src={img} alt="" style={{ maxHeight: '200px', borderRadius: '4px', border: '1px solid #ddd' }} />
                        ))}
                      </div>
                      
                      <div className="article-body" style={{ lineHeight: '1.6', fontSize: '1.1rem', whiteSpace: 'pre-wrap' }}>
                        {createLinks(
                          articles.find(a => a.id === selectedArticleId)?.content || '',
                          allTitles,
                          articles.find(a => a.id === selectedArticleId)?.title || '',
                          (title) => {
                            const target = articles.find(a => a.title === title);
                            if (target?.id) setSelectedArticleId(target.id);
                          }
                        )}
                      </div>
                    </article>
                  )}
                </div>
              ) : (
                <div className="article-grid">
                  {filteredArticles.map(art => (
                    <div key={art.id} className="article-card" onClick={() => setSelectedArticleId(art.id!)}>
                      <h3 style={{ margin: '0 0 0.5rem 0' }}>{art.title}</h3>
                      <div style={{ fontSize: '0.85rem', color: '#666' }}>
                        {art.category.slice(0, 2).join(', ')}{art.category.length > 2 ? '...' : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(activeMenu === 'create' || activeMenu === 'edit') && (
            <div>
              <h2>{activeMenu === 'edit' ? '📝 記事を編集' : '➕ 新規記事作成'}</h2>
              
              {activeMenu === 'edit' && !editArticleId ? (
                <div className="article-grid">
                  {articles.map(art => (
                    <div key={art.id} className="article-card" onClick={() => setEditArticleId(art.id!)}>
                      <h3>{art.title}</h3>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="form">
                  <div className="form-group">
                    <label>記事タイトル</label>
                    <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="記事タイトルを書く欄" />
                  </div>
                  <div className="form-group">
                    <label>カテゴリー (カンマ区切り)</label>
                    <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="例: 技術, プログラミング" />
                  </div>
                  <div className="form-group">
                    <label>画像</label>
                    <div 
                      className={`drop-zone ${isDragging ? 'dragging' : ''}`}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => document.getElementById('image-input')?.click()}
                      style={{ 
                        border: '2px dashed #ccc', 
                        padding: '20px', 
                        textAlign: 'center', 
                        borderRadius: '8px', 
                        cursor: 'pointer',
                        backgroundColor: '#f9f9f9',
                        marginBottom: '10px'
                      }}
                    >
                      <ImageIcon size={24} style={{ marginBottom: '0.5rem' }} />
                      <div>クリックして画像を選択、または画面のどこにでも画像をドロップして追加できます</div>
                      <input 
                        id="image-input"
                        type="file" 
                        accept="image/*" 
                        multiple 
                        onChange={handleImageUpload} 
                        style={{ display: 'none' }} 
                      />
                    </div>
                    {images.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <button className="btn" onClick={() => setImages([])} style={{ backgroundColor: '#fff', border: '1px solid #ccc', fontSize: '0.8rem', padding: '5px 10px' }}>
                          全画像をリセット ({images.length}枚)
                        </button>
                      </div>
                    )}
                    <div className="image-preview-grid">
                      {images.map((img, i) => (
                        <div key={i} className="image-preview-item" style={{ position: 'relative', display: 'inline-block', margin: '5px' }}>
                          <img src={img} alt="" style={{ width: '100px', height: '100px', objectFit: 'cover', borderRadius: '4px' }} />
                          <button 
                            className="btn-danger" 
                            style={{ position: 'absolute', top: '2px', right: '2px', padding: '0 5px', borderRadius: '50%', border: 'none', cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setImages(prev => prev.filter((_, idx) => idx !== i));
                            }}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="form-group">
                    <label>記事内容</label>
                    <div className="marker-tools">
                      <button onClick={() => insertMarker('yellow')} className="marker-btn" style={{ backgroundColor: '#ffeb3b' }}>黄マーカー</button>
                      <button onClick={() => insertMarker('green')} className="marker-btn" style={{ backgroundColor: '#8bc34a' }}>緑マーカー</button>
                      <button onClick={() => insertMarker('blue')} className="marker-btn" style={{ backgroundColor: '#03a9f4', color: 'white' }}>青マーカー</button>
                      <button onClick={() => insertMarker('red')} className="marker-btn" style={{ backgroundColor: '#f44336', color: 'white' }}>赤マーカー</button>
                    </div>
                    <textarea 
                      id="content-area"
                      value={content} 
                      onChange={(e) => setContent(e.target.value)} 
                      placeholder="内容を入力してください... <yellow>重要な部分</yellow> のようにマーカーを使えます。"
                    />
                  </div>
                  <button className="btn btn-primary" onClick={handleSave} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                    <Save size={20} /> {editArticleId ? '更新を保存' : '記事を保存'}
                  </button>
                  {editArticleId && (
                    <button className="btn" onClick={() => setEditArticleId(null)} style={{ width: '100%', marginTop: '0.5rem' }}>キャンセル</button>
                  )}
                </div>
              )}
            </div>
          )}

          {activeMenu === 'delete' && (
            <div>
              <h2>🗑️ 記事を削除</h2>
              <div className="article-grid">
                {articles.map(art => (
                  <div key={art.id} className="article-card" style={{ borderColor: '#f8d7da' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <h3 style={{ margin: 0 }}>{art.title}</h3>
                      <button onClick={() => handleDelete(art.id!)} className="btn-danger" style={{ padding: '5px 10px', borderRadius: '4px' }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeMenu === 'stats' && (
            <div>
              <h2>📊 統計情報</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-label">総記事数</div>
                  <div className="stat-value">{articles.length}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">カテゴリー数</div>
                  <div className="stat-value">{new Set(articles.flatMap(a => a.category)).size}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">総文字数</div>
                  <div className="stat-value">{articles.reduce((acc, a) => acc + a.content.length, 0).toLocaleString()}</div>
                </div>
                <div className="stat-card">
                  <div className="stat-label">総画像数</div>
                  <div className="stat-value">{articles.reduce((acc, a) => acc + a.images.length, 0)}</div>
                </div>
              </div>
              
              <h3 style={{ marginTop: '2rem' }}>カテゴリー別記事数</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {Object.entries(
                  articles.flatMap(a => a.category).reduce((acc, cat) => {
                    acc[cat] = (acc[cat] || 0) + 1;
                    return acc;
                  }, {} as Record<string, number>)
                )
                .sort((a, b) => b[1] - a[1])
                .map(([cat, count]) => (
                  <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem', background: 'white', borderRadius: '4px', border: '1px solid #eee' }}>
                    <span>{cat}</span>
                    <span style={{ fontWeight: 'bold' }}>{count} 件</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
