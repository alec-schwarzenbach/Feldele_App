import { useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Avatar, Empty, Fab, Header, Icon, PhotoPicker, Stars } from '../components/ui'
import { api } from '../lib/api'
import { timeAgo } from '../lib/dates'
import { useData } from '../lib/store'
import { isAdmin, type PostCategory } from '../lib/types'

const CATEGORIES: { value: PostCategory; label: string; emoji: string }[] = [
  { value: 'tip', label: 'Tip', emoji: '💡' },
  { value: 'trip', label: 'Trip', emoji: '🥾' },
  { value: 'review', label: 'Review', emoji: '⭐' },
  { value: 'restaurant', label: 'Food', emoji: '🍽️' },
  { value: 'other', label: 'Other', emoji: '📌' },
]
const cat = (v: PostCategory) => CATEGORIES.find((c) => c.value === v)!

export function Board() {
  const { data, name } = useData()
  const [filter, setFilter] = useState<PostCategory | 'all'>('all')
  const posts = data.posts
    .filter((p) => filter === 'all' || p.category === filter)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))

  return (
    <>
      <Header title="Board" />
      <div className="page">
        <div className="chips scroll">
          <button className={'chip' + (filter === 'all' ? ' on' : '')} onClick={() => setFilter('all')}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c.value} className={'chip' + (filter === c.value ? ' on' : '')} onClick={() => setFilter(c.value)}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
        {posts.length === 0 && <Empty>Nothing here yet – share the first tip!</Empty>}
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
      </div>
      <Fab to="/board/new" label="New post" />
    </>
  )
}

export function PostDetail() {
  const { id } = useParams()
  const { user, data, mutate, name } = useData()
  const nav = useNavigate()
  const [comment, setComment] = useState('')
  const p = data.posts.find((x) => x.id === id)
  if (!p) return (<><Header title="Post" back /><Empty>Post not found.</Empty></>)
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
        <button className="icon-btn" onClick={() => nav(`/board/${p.id}/edit`)} aria-label="Edit"><Icon name="edit" /></button>
      ) : undefined} />
      <div className="page">
        <article className="card post">
          {p.photoUrl && <img src={p.photoUrl} alt="" />}
          <h2>{p.title}</h2>
          {p.rating && <Stars value={p.rating} />}
          <p className="pre">{p.body}</p>
          <p className="small muted">
            {name(p.userId)} · {timeAgo(p.createdAt)}{p.updatedAt !== p.createdAt ? ' · edited' : ''}
          </p>
          {mine && (
            <button className="btn small danger" onClick={async () => {
              if (confirm('Delete this post?')) {
                await mutate(() => api.deletePost(p.id))
                nav('/board', { replace: true })
              }
            }}>Delete post</button>
          )}
        </article>

        <h2>Comments ({comments.length})</h2>
        {comments.map((c) => (
          <div key={c.id} className="comment">
            <Avatar id={c.userId} name={name(c.userId)} size={28} />
            <div className="grow">
              <p><strong>{name(c.userId)}</strong> <span className="small muted">{timeAgo(c.createdAt)}</span></p>
              <p className="pre">{c.body}</p>
            </div>
            {(c.userId === user.id || isAdmin(user)) && (
              <button className="icon-btn" aria-label="Delete comment" onClick={() => mutate(() => api.deleteComment(c.id))}>
                <Icon name="trash" size={16} />
              </button>
            )}
          </div>
        ))}
        <form className="comment-form" onSubmit={send}>
          <input value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Write a comment…" />
          <button className="btn primary small">Send</button>
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
      <Header title={existing ? 'Edit post' : 'New post'} back />
      <form className="page form" onSubmit={submit}>
        <div className="chips">
          {CATEGORIES.map((c) => (
            <button type="button" key={c.value} className={'chip' + (category === c.value ? ' on' : '')} onClick={() => setCategory(c.value)}>
              {c.emoji} {c.label}
            </button>
          ))}
        </div>
        <label>Title<input value={title} onChange={(e) => setTitle(e.target.value)} required /></label>
        {rated && <div><span className="label">Rating</span><Stars value={rating} onChange={setRating} /></div>}
        <label>Text<textarea rows={6} value={body} onChange={(e) => setBody(e.target.value)} required /></label>
        <PhotoPicker value={photoUrl} onChange={setPhoto} />
        <button className="btn primary">{existing ? 'Save' : 'Post'}</button>
      </form>
    </>
  )
}
