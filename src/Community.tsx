import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { getPublicArticles, setPublicArticle, type PublicArticle } from './publicArticles';
import { analyzeTexts, japanDate } from './mining';
import { getStoredSession } from './apiAuth';
import { db } from './db';
import { syncToCloudflare } from './cloudflareSync';

export function Community() {
  const [articles, setArticles] = useState<PublicArticle[]>([]);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dateBasis, setDateBasis] = useState<'published_at' | 'updated_at'>('published_at');
  const [period, setPeriod] = useState('all');
  const [date, setDate] = useState(() => japanDate(new Date().toISOString()));
  const [tag, setTag] = useState('');
  const [query, setQuery] = useState('');
  const [excluded, setExcluded] = useState('');
  const [view, setView] = useState<'articles' | 'cloud' | 'network'>('articles');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const userId = getStoredSession()?.user.id;
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setArticles([]);
    getPublicArticles(controller.signal).then(setArticles).catch(e => {
      if (!controller.signal.aborted) setError(e.message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [revision]);
  const tags = useMemo(() => [...new Set(articles.flatMap(a => a.category))].sort(), [articles]);
  const filtered = useMemo(() => articles.filter(a => {
    const targetDate = period === 'today' ? japanDate(new Date().toISOString()) : date;
    return (period === 'all' || japanDate(a[dateBasis]) === targetDate) &&
      (!tag || a.category.includes(tag)) && `${a.title} ${a.content} ${a.username}`.toLowerCase().includes(query.toLowerCase());
  }), [articles, period, date, dateBasis, tag, query]);
  const analysis = useMemo(() => analyzeTexts(filtered.map(a => `${a.title}\n${a.content}`), excluded, tags), [filtered, excluded, tags]);
  const nodes = analysis.words.slice(0, 20).map((word, i, all) => ({ ...word,
    x: 420 + 290 * Math.cos(i * 2 * Math.PI / all.length - Math.PI / 2),
    y: 300 + 225 * Math.sin(i * 2 * Math.PI / all.length - Math.PI / 2) }));
  const detail = filtered.find(a => a.id === selected);
  const unpublish = async (article: PublicArticle) => {
    setBusy(true); setError('');
    try {
      await setPublicArticle({ title: article.title, content: article.content, category: article.category, images: article.images, created: article.published_at, publicId: article.id }, 'private');
      await db.articles.filter(a => a.publicId === article.id).modify({ visibility: 'private', updated: new Date().toISOString() });
      setRevision(r => r + 1); setSelected(null);
      if (!(await syncToCloudflare())) setError('非公開にしました。バックアップ同期は失敗しました。再ログインして同期してください。');
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };
  return <section className="community">
    <h2>みんなの記事</h2>
    <p className="muted">公開された学びを読み、言葉のつながりを探してみましょう。</p>
    <div className="community-filters">
      <label>日付の基準<select value={dateBasis} onChange={e => setDateBasis(e.target.value as typeof dateBasis)}><option value="published_at">公開日</option><option value="updated_at">最終更新日</option></select></label>
      <label>期間<select value={period} onChange={e => setPeriod(e.target.value)}><option value="all">全期間</option><option value="today">今日</option><option value="date">日付を指定</option></select></label>
      {period === 'date' && <label>対象日<input type="date" value={date} onChange={e => setDate(e.target.value)} /></label>}
      <label>タグ<select value={tag} onChange={e => setTag(e.target.value)}><option value="">すべて</option>{tags.map(t => <option key={t}>{t}</option>)}</select></label>
      <label>キーワード<input value={query} onChange={e => setQuery(e.target.value)} placeholder="タイトル・本文・投稿者" /></label>
      <button className="btn" disabled={loading || busy} onClick={() => setRevision(r => r + 1)}>再読み込み</button>
    </div>
    <p className="muted">日付は日本時間です。最終更新日を選ぶと、その日に編集された公開記事も分析できます。</p>
    <div className="community-tabs" aria-label="表示方法">
      {([['articles', '記事一覧'], ['cloud', 'ワードクラウド'], ['network', '共起ネットワーク']] as const).map(([key, label]) => <button key={key} className={`btn ${view === key ? 'btn-primary' : ''}`} aria-pressed={view === key} onClick={() => setView(key)}>{label}</button>)}
    </div>
    {loading && <p role="status">公開記事を読み込み中…</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {!loading && <p aria-live="polite">対象の記事：{filtered.length} 件</p>}
    {!loading && !error && !filtered.length && <p>対象の記事がありません。期間やタグを変更するか、自分の記事を公開してください。</p>}
    {view !== 'articles' && filtered.length > 0 && <>
      <label>分析から除く語<input value={excluded} onChange={e => setExcluded(e.target.value)} placeholder="空白またはカンマで区切る" /></label>
      <p className="muted">タイトルと本文を日本語の単語に区切り、助詞などを除いて集計します。タグの語は分割用の辞書として使います。タグ自体と投稿者名は集計しません。分析はこのブラウザ内で行います。</p>
      {!analysis.words.length && <p>分析できる語がありません。除外語や対象記事を変更してください。</p>}
    </>}
    {view === 'cloud' && <>
      <div className="word-cloud" aria-label="語の出現回数を大きさで表したワードクラウド">{analysis.words.map((w, i) => <span key={w.text} className={`word word-${i % 3}`} style={{ fontSize: `${16 + 44 * Math.sqrt(w.count / analysis.words[0].count)}px` }} title={`${w.text}：${w.count}回`}>{w.text}</span>)}</div>
      <details><summary>出現回数を表で確認（上位60語）</summary><table><thead><tr><th>語</th><th>出現回数</th></tr></thead><tbody>{analysis.words.map(w => <tr key={w.text}><td>{w.text}</td><td>{w.count}</td></tr>)}</tbody></table></details>
    </>}
    {view === 'network' && <>
      <p className="muted">同じ記事に登場した語を線で結びます。線が太いほど、一緒に登場した記事が多いことを示します（上位20語・50組）。</p>
      {analysis.edges.length ? <svg className="word-network" viewBox="0 0 840 600" role="img" aria-label="記事単位の共起ネットワーク。各組の件数は下の表で確認できます。">
        {analysis.edges.map(e => {
          const a = nodes.find(n => n.text === e.source)!, b = nodes.find(n => n.text === e.target)!;
          return <line key={`${e.source}-${e.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke="var(--primary-color)" opacity="0.3" strokeWidth={1 + 5 * e.count / analysis.edges[0].count}><title>{e.source}・{e.target}：{e.count}記事</title></line>;
        })}
        {nodes.map(n => <g key={n.text}><circle cx={n.x} cy={n.y} r={9 + 13 * Math.sqrt(n.count / nodes[0].count)} fill="var(--primary-color)" /><text x={n.x} y={n.y - 30} textAnchor="middle" fill="var(--text-color)" fontSize="16">{n.text.length > 12 ? n.text.slice(0, 11) + '…' : n.text}<title>{n.text}：{n.count}回</title></text></g>)}
      </svg> : filtered.length > 0 && <p>共起する語がありません。対象記事や除外語を変更してください。</p>}
      <details><summary>語の組と記事数を表で確認</summary><table><thead><tr><th>語の組</th><th>共起記事数</th></tr></thead><tbody>{analysis.edges.map(e => <tr key={`${e.source}-${e.target}`}><td>{e.source}・{e.target}</td><td>{e.count}</td></tr>)}</tbody></table></details>
    </>}
    {view === 'articles' && (detail ? <article className="article-view">
      <button className="btn" onClick={() => setSelected(null)}>← 一覧へ</button><h3>{detail.title}</h3>
      <p>{detail.username} · {japanDate(detail.published_at)}</p><p>{detail.category.map(t => <span className="tag" key={t}>{t}</span>)}</p>
      <ReactMarkdown>{detail.content}</ReactMarkdown>
      {detail.images.filter(src => /^data:image\/(png|jpeg|gif|webp);base64,/.test(src)).map((src, i) => <img className="public-image" key={i} src={src} alt={`${detail.title}の添付画像 ${i + 1}`} />)}
      {detail.user_id === userId && <button className="btn" disabled={busy} onClick={() => unpublish(detail)}>非公開にする</button>}
    </article> : <div className="article-grid">{filtered.map(a => <button key={a.id} className="article-card public-card" onClick={() => setSelected(a.id)}><h3>{a.title}</h3><p className="muted">{a.username} · {japanDate(a.published_at)}</p><p>{a.category.map(t => <span className="tag" key={t}>{t}</span>)}</p><p>{a.content.slice(0, 100)}</p></button>)}</div>)}
  </section>;
}
