import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Avatar, Empty, Fab, Header, Icon, PhotoPicker, Segmented, Stars } from '../components/ui'
import { api } from '../lib/api'
import { timeAgo } from '../lib/dates'
import { useData } from '../lib/store'
import { isAdmin, type PostCategory } from '../lib/types'

const CATEGORIES: { value: PostCategory; label: string; emoji: string }[] = [
  { value: 'tip', label: 'Tipp', emoji: '💡' },
  { value: 'trip', label: 'Ausflug', emoji: '🥾' },
  { value: 'review', label: 'Bewertung', emoji: '⭐' },
  { value: 'restaurant', label: 'Essen', emoji: '🍽️' },
  { value: 'other', label: 'Anderes', emoji: '📌' },
]
const cat = (v: PostCategory) => CATEGORIES.find((c) => c.value === v)!

type Tab = 'posts' | 'shopping'

export function Board() {
  const [params, setParams] = useSearchParams()
  const tab: Tab = params.get('tab') === 'shopping' ? 'shopping' : 'posts'
  const { data } = useData()
  const open = data.shopping.filter((s) => !s.done).length

  return (
    <>
      <Header title="Pinnwand" />
      <div className="page">
        <Segmented value={tab} onChange={(t) => setParams(t === 'shopping' ? { tab: 'shopping' } : {}, { replace: true })} options={[
          { value: 'posts', label: 'Beiträge' },
          { value: 'shopping', label: `🛒 Einkaufsliste${open ? ` (${open})` : ''}` },
        ]} />
        {tab === 'posts' ? <Posts /> : <ShoppingList />}
      </div>
      {tab === 'posts' && <Fab to="/board/new" label="Neuer Beitrag" />}
    </>
  )
}

function Posts() {
  const { data, name } = useData()
  const [filter, setFilter] = useState<PostCategory | 'all'>('all')
  const posts = data.posts
    .filter((p) => filter === 'all' || p.category === filter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <>
      <div className="chips scroll">
        <button className={'chip' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>Alle</button>
        {CATEGORIES.map((c) => (
          <button key={c.value} className={'chip' + (filter === c.value ? ' on' : '')} onClick={() => setFilter(c.value)}>
            {c.emoji} {c.label}
          </button>
        ))}
      </div>
      {posts.length === 0 && <Empty>Noch nichts hier – teile den ersten Tipp!</Empty>}
      {posts.map((p) => {
        const comments = data.comments.filter((c) => c.postId === p.id).length
        return (
          <Link key={p.id} to={`/board/${p.id}`} className="card post">
            {p.photoUrl && <img src={p.photoUrl} alt="" />}
            <span className="tag">{cat(p.category).emoji} {cat(p.category).label}</span>
            <h2>{p.title}</h2>
            {p.rating && <Stars value={p.rating} />}
            <p className="clamp">{p.body}</p>
            <p className="small muted">{name(p.userId)} · {timeAgo(p.createdAt)} · 💬 {comments}</p>
          </Link>
        )
      })}
    </>
  )
}

/** What the next visitors should buy. Anyone adds items and ticks them off when bought. */
function ShoppingList() {
  const { data, mutate, name } = useData()
  const [text, setText] = useState('')
  const items = [...data.shopping].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const open = items.filter((s) => !s.done)
  const done = items.filter((s) => s.done)

  async function add(e: FormEvent) {
    e.preventDefault()
    if (!text.trim()) return
    await mutate(() => api.addShopping(text))
    setText('')
  }

  return (
    <>
      <p className="small muted">Was die nächsten Besucher einkaufen sollen. Abhaken, sobald es gekauft ist.</p>
      <form className="comment-form" onSubmit={add}>
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="z. B. Kaffee, Abwaschmittel…" maxLength={200} />
        <button className="btn primary small">Hinzufügen</button>
      </form>

      <section className="card">
        {open.length === 0 && <p className="muted small">Alles eingekauft 👍</p>}
        {open.map((s) => (
          <label key={s.id} className="shop-item">
            <input type="checkbox" checked={false} onChange={() => mutate(() => api.setShoppingDone(s.id, true))} />
            <span className="grow">{s.text}<br /><span className="small muted">{name(s.userId)} · {timeAgo(s.createdAt)}</span></span>
            <button type="button" className="icon-btn" aria-label={`${s.text} löschen`} onClick={() => mutate(() => api.deleteShopping(s.id))}>
              <Icon name="trash" size={16} />
            </button>
          </label>
        ))}
      </section>

      {done.length > 0 && (
        <section className="card">
          <div className="row-head">
            <h2>Gekauft</h2>
            <button className="btn small ghost" onClick={() =>
              confirm('Alle gekauften Einträge entfernen?') && mutate(async () => {
                for (const s of done) await api.deleteShopping(s.id)
              })}>Liste leeren</button>
          </div>
          {done.map((s) => (
            <label key={s.id} className="shop-item done">
              <input type="checkbox" checked onChange={() => mutate(() => api.setShoppingDone(s.id, false))} />
              <span className="grow">{s.text}{s.doneBy && <><br /><span className="small muted">gekauft von {name(s.doneBy)}</span></>}</span>
            </label>
          ))}
        </section>
      )}
    </>
  )
}

export function PostDetail() {
  const { id } = useParams()
  const { user, data, mutate, name } = useData()
  const nav = useNavigate()
  const [comment, setComment] = useState('')
  const p = data.posts.find((x) => x.id === id)
  if (!p) return (<><Header title="Beitrag" back /><Empty>Beitrag nicht gefunden.</Empty></>)
  const comments = data.comments.filter((c) => c.postId === p.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  const mine = p.userId === user.id || isAdmin(user)

  async function send(e: FormEvent) {
    e.preventDefault()
    if (!comment.trim()) return
    await mutate(() => api.addComment(p!.id, comment.trim()))
    setComment('')
  }

  return (
    <>
      <Header title={cat(p.category).label} back action={mine ? (
        <button className="icon-btn" onClick={() => nav(`/board/${p.id}/edit`)} aria-label="Bearbeiten"><Icon name="edit" /></button>
      ) : undefined} />
      <div className="page">
        <article className="card post">
          {p.photoUrl && <img src={p.photoUrl} alt="" />}
          <h2>{p.title}</h2>
          {p.rating && <Stars value={p.rating} />}
          <p className="pre">{p.body}</p>
          <p className="small muted">
            {name(p.userId)} · {timeAgo(p.createdAt)}{p.updatedAt !== p.createdAt ? ' · bearbeitet' : ''}
          </p>
          {mine && (
            <button className="btn small danger" onClick={async () => {
              if (confirm('Diesen Beitrag löschen?')) {
                await mutate(() => api.deletePost(p.id))
                nav('/board', { replace: true })
              }
            }}>Beitrag löschen</button>
          )}
        </article>

        <h2>Kommentare ({comments.length})</h2>
        {comments.map((c) => (
          <div key={c.id} className="comment">
            <Avatar id={c.userId} name={name(c.userId)} size={28} />
            <div className="grow">
              <p><strong>{name(c.userId)}</strong> <span className="small muted">{timeAgo(c.createdAt)}</span></p>
              <p className="pre">{c.body}</p>
            </div>
            {(c.userId === user.id || isAdmin(user)) && (
              <button className="icon-btn" aria-label="Kommentar löschen" onClick={() => mutate(() => api.deleteComment(c.id))}>
                <Icon name="trash" size={16} />
              </button>
            )}
          </div>
        ))}
        <form className="comment-form" onSubmit={send}>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Kommentar schreiben…" />
          <button className="btn primary small">Senden</button>
        </form>
      </div>
    </>
  )
}

export function PostForm() {
  const { id } = useParams()
  const { data, mutate } = useData()
  const nav = useNavigate()
  const existing = id ? data.posts.find((p) => p.id === id) : undefined
  const [category, setCategory] = useState<PostCategory>(existing?.category ?? 'tip')
  const [title, setTitle] = useState(existing?.title ?? '')
  const [body, setBody] = useState(existing?.body ?? '')
  const [rating, setRating] = useState(existing?.rating)
  const [photoUrl, setPhoto] = useState(existing?.photoUrl)
  const rated = category === 'review' || category === 'restaurant'

  async function submit(e: FormEvent) {
    e.preventDefault()
    const fields = { category, title: title.trim(), body: body.trim(), rating: rated ? rating : undefined, photoUrl }
    const postId = await mutate(async () => {
      if (!existing) return (await api.createPost(fields)).id
      await api.updatePost(existing.id, fields)
      return existing.id
    })
    if (postId) nav(`/board/${postId}`, { replace: true })
  }

  return (
    <>
      <Header title={existing ? 'Beitrag bearbeiten' : 'Neuer Beitrag'} back />
      <form className="page form" onSubmit={submit}>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button type="button" key={c.value} className={'chip' + (category === c.value ? ' on' : '')} onClick={() => setCategory(c.value)}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
        <label>Titel<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
        {rated && <div><span className="label">Bewertung</span><Stars value={rating} onChange={setRating} /></div>}
        <label>Text<textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} required /></label>
        <PhotoPicker value={photoUrl} onChange={setPhoto} />
        <button className="btn primary">{existing ? 'Speichern' : 'Veröffentlichen'}</button>
      </form>
    </>
  )
}
