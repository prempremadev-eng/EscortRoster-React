import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { Icon, initials } from '../post/icons.jsx';
import { clock } from '../post/media.js';
import '../post/post.css';
import './supervisor.css';

const STATUS = {
  alert: { label: 'Alert', cls: 'pd-red' },
  empty: { label: 'Empty', cls: 'pd-red' },
  waiting: { label: 'IN, not taken over', cls: 'pd-amber' },
  break: { label: 'On break', cls: 'pd-amber' },
  on_duty: { label: 'On duty', cls: 'pd-green' },
  none: { label: 'No guard', cls: 'pd-neutral' }
};

// Small browser memory (name, branch, what was read). Private mode may block it: then it is
// simply not remembered.
function remember(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
}
function keep(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // not remembered, fine
  }
}

function Message({ m }) {
  if (m.kind === 'system') return <div className="pd-sys pd-sys-green">{Icon.check}{m.text}</div>;
  if (m.kind === 'system_red') return <div className="pd-sys pd-sys-red">{m.text}</div>;
  if (m.kind === 'work' && m.work) {
    const w = m.work;
    return (
      <div className={'pd-work sup-left ' + (w.expired && !w.finished ? 'pd-work-expired' : '')}>
        <div className="pd-row-between">
          <div className="pd-work-label">WORK UPDATE · {m.author.toUpperCase()} · {m.time}</div>
          <div className={'pd-pill pd-pill-sm ' + (w.finished ? 'pd-green' : w.expired ? 'pd-red' : 'pd-amber')}>{w.finished ? 'Finished ' + w.finished : w.expired ? 'Permit expired' : 'In progress'}</div>
        </div>
        <div className="pd-work-title">{w.contractor} · {w.persons} persons</div>
        <div className="pd-work-desc">{w.description}{w.description ? ' · ' : ''}Permit {w.from} – {w.to}</div>
      </div>
    );
  }
  if (m.kind === 'alert' && m.alert) {
    const a = m.alert;
    return (
      <div className="pd-alert sup-left">
        <div className="pd-alert-head"><span>ALERT · {m.author.toUpperCase()}</span><span>{m.time}</span></div>
        <div className="pd-alert-body">
          <div>{m.text}</div>
          <div className="pd-small pd-muted">
            {a.status === 'seen' ? 'Seen by ' + a.seenBy + ' · ' + a.seen : a.status === 'cancelled' ? 'Cancelled by the guard · ' + a.cancelled : 'Not seen yet · ' + a.waitMin + ' min'}
          </div>
        </div>
      </div>
    );
  }
  const mine = m.kind === 'supervisor' && m.mine;
  return (
    <div className={'pd-bubble ' + (mine ? 'pd-bubble-me sup-bubble-sup' : 'pd-bubble-other')}>
      <div className="pd-author">{m.kind === 'supervisor' ? (mine ? 'You' : m.author) + ' · Supervisor' : m.author}</div>
      {m.reply && <div className="pd-quote"><div className="pd-quote-name">{m.reply.author}</div><div className="pd-quote-text">{m.reply.text}</div></div>}
      {m.media && m.media.url && m.kind === 'photo' && <a href={m.media.url} target="_blank" rel="noreferrer"><img src={m.media.url} alt="Photo from the post" className="pd-media-img" /></a>}
      {m.media && m.media.url && m.kind === 'video' && <video src={m.media.url} controls playsInline preload="metadata" className="pd-media-img" />}
      {m.media && m.media.url && m.kind === 'voice' && <audio src={m.media.url} controls preload="metadata" className="pd-media-audio" />}
      {m.media && (
        <div className="pd-media-tags">
          {m.media.source === 'camera' && <span className="pd-tag pd-tag-green">Taken at post</span>}
          {m.media.source === 'gallery' && <span className="pd-tag pd-tag-amber">From gallery</span>}
          {m.media.duration > 0 && <span className="pd-tag">{clock(m.media.duration)}</span>}
        </div>
      )}
      {m.text && <div>{m.text}</div>}
      <div className="pd-meta">
        {m.pinned && <>{Icon.pin}Pinned for next guard · </>}
        {m.forwarded && <b className="sup-fwd">Sent to you · </b>}
        {m.time}
        {m.kind === 'supervisor' && (m.seenBy ? ' · Seen by ' + m.seenBy : ' · Not seen yet')}
      </div>
    </div>
  );
}

// Screen 13: supervisor home. Posts on the left (alerts / empty first), the chosen post's timeline
// on the right with a message box.
export default function SupervisorInbox() {
  const [name, setName] = useState(() => remember('sup_name', ''));
  const [nameInput, setNameInput] = useState('');
  const [branches, setBranches] = useState([]);
  const [branch, setBranch] = useState(() => remember('sup_branch', ''));
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState(null);
  const [post, setPost] = useState(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seen = useRef(remember('sup_seen', {}));
  const endRef = useRef(null);

  useEffect(() => {
    api.getPosts().then(r => {
      const b = r.data.branches;
      setBranches(b);
      setBranch(cur => cur || (b[0] ? String(b[0].ROWID) : ''));
    }).catch(err => setError(err.message));
  }, []);

  const loadList = useCallback(async () => {
    if (!branch) return;
    try {
      setList((await api.supInbox(branch, seen.current)).data);
    } catch (err) {
      setError(err.message);
    }
  }, [branch]);

  const loadPost = useCallback(async id => {
    if (!id) return;
    try {
      const d = (await api.supPost(id, name)).data;
      setPost(d);
      // Everything on screen now counts as read.
      const lastStamp = d.messages.length ? d.messages[d.messages.length - 1].stamp : '';
      if (lastStamp) {
        seen.current = { ...seen.current, [id]: lastStamp };
        keep('sup_seen', seen.current);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [name]);

  useEffect(() => { keep('sup_branch', branch); setOpenId(null); setPost(null); loadList(); }, [branch, loadList]);
  useEffect(() => { if (openId) { setPost(null); loadPost(openId).then(loadList); } }, [openId, loadPost, loadList]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: 'end' }); }, [post]);

  // No timer: every list load costs Data Store reads (the free tier is small and shared).
  // The list refreshes when the supervisor comes back to the tab, or with the refresh button.
  useEffect(() => {
    const onShow = () => { if (document.visibilityState === 'visible') loadList(); };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, [loadList]);

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.supMessage(openId, name, text);
      setText('');
      await loadPost(openId);
      loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (!name) {
    return (
      <div className="sup-name">
        <form className="pd pd-card sup-name-card" onSubmit={e => { e.preventDefault(); const n = nameInput.trim(); if (n) { setName(n); keep('sup_name', n); } }}>
          <div className="pd-title pd-title-sm">Supervisor</div>
          <label htmlFor="sup-name" className="pd-field-title">Your name</label>
          <input id="sup-name" className="pd-search" value={nameInput} onChange={e => setNameInput(e.target.value)} placeholder="Murugan" maxLength={100} autoFocus />
          <div className="pd-small pd-muted">Guards see this name on your messages and on "Seen by". It is kept on this computer until login comes.</div>
          <button className="pd-btn pd-btn-primary" type="submit" disabled={!nameInput.trim()}>Continue</button>
        </form>
      </div>
    );
  }

  const counts = {
    all: (list || []).length,
    alerts: (list || []).filter(p => p.status === 'alert' || p.status === 'empty').length,
    break: (list || []).filter(p => p.status === 'break').length,
    unread: (list || []).filter(p => p.unread > 0).length
  };
  const shown = (list || []).filter(p =>
    (filter === 'all' || (filter === 'alerts' && (p.status === 'alert' || p.status === 'empty')) || (filter === 'break' && p.status === 'break') || (filter === 'unread' && p.unread > 0))
    && (p.name + ' ' + p.guard).toLowerCase().includes(search.trim().toLowerCase()));
  const branchName = (branches.find(b => String(b.ROWID) === String(branch)) || {}).branch_name || '';
  const listItem = list && list.find(p => p.ROWID === openId);
  const main = post && (post.guards.find(g => g.main) || null);
  let lastDate = '';

  return (
    <div className="pd sup">
      <nav className="sup-rail">
        <button className="sup-rail-btn sup-rail-on" aria-label="Posts" title="Posts">{Icon.chat}</button>
        <a className="sup-rail-btn" href="#chart" aria-label="Schedule" title="Schedule (Duty Chart)">{Icon.calendar}</a>
        <a className="sup-rail-btn" href="#master" aria-label="Guards" title="Guard Master">{Icon.shield}</a>
        <div className="pd-grow"></div>
        <button className="sup-rail-btn sup-rail-me" title={'Signed as ' + name + ' · change'} onClick={() => { setName(''); keep('sup_name', ''); setNameInput(name); }}>{initials(name)}</button>
      </nav>

      <aside className="sup-list">
        <div className="sup-list-head">
          <div className="pd-row-between">
            <div className="pd-title">Posts</div>
            <button className="pd-icon-btn" onClick={loadList} aria-label="Refresh">{Icon.refresh}</button>
          </div>
          <select className="pd-search" value={branch} onChange={e => setBranch(e.target.value)} aria-label="Branch">
            {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{b.branch_name}{b.area ? ' (' + b.area + ')' : ''} · {b.city}</option>)}
          </select>
          <input className="pd-search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search post or guard" aria-label="Search post or guard" />
          <div className="pd-quick pd-wrap">
            {[['all', 'All'], ['alerts', 'Alerts'], ['break', 'On break'], ['unread', 'Unread']].map(([k, label]) => (
              <button key={k} className={'pd-chip pd-chip-sm' + (filter === k ? ' pd-chip-primary' : '')} onClick={() => setFilter(k)}>{label} {counts[k]}</button>
            ))}
          </div>
        </div>
        <div className="sup-list-body">
          {!list && <div className="pd-muted sup-pad">Loading...</div>}
          {list && shown.length === 0 && <div className="pd-muted sup-pad">No posts here.</div>}
          {shown.map(p => (
            <button key={p.ROWID} className={'sup-item' + (p.ROWID === openId ? ' sup-item-on' : '') + (p.status === 'alert' || p.status === 'empty' ? ' sup-item-red' : '')} onClick={() => setOpenId(p.ROWID)}>
              <span className="pd-avatar pd-avatar-sm">{initials(p.name)}</span>
              <span className="pd-grow sup-item-main">
                <span className="pd-row-between"><b>{p.name}</b><span className="pd-small pd-muted">{p.last ? p.last.time : ''}</span></span>
                <span className="pd-row-between">
                  <span className="pd-small sup-item-last">{p.last ? p.last.text : 'No messages today'}</span>
                  {p.unread > 0 && <span className="sup-badge">{p.unread}</span>}
                </span>
                <span className="pd-row-between">
                  <span className="pd-small pd-muted">{p.guard ? p.guard + ' · Shift ' + p.shift : 'No guard now'}</span>
                  <span className={'pd-pill pd-pill-sm ' + STATUS[p.status].cls}>{p.status === 'alert' ? p.alerts + ' alert' + (p.alerts > 1 ? 's' : '') : STATUS[p.status].label}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </aside>

      <main className="sup-pane">
        {!openId && <div className="sup-empty">{branchName ? 'Pick a post of ' + branchName : 'Pick a branch'}</div>}
        {openId && (
          <>
            <div className="sup-pane-head">
              <span className="pd-avatar">{main ? initials(main.name) : '–'}</span>
              <div className="pd-grow">
                <div className="pd-title pd-title-sm">{post ? post.post : listItem ? listItem.name : ''}</div>
                <div className="pd-small pd-muted">
                  {post && (post.guards.length
                    ? post.guards.map(g => g.name + ' · Shift ' + g.shift + (g.took ? ' · took over ' + g.took : '') + (g.status === 'out' ? ' · card OUT' : g.status === 'on_break' ? ' · on break' : g.status === 'waiting' ? ' · not taken over' : '')).join('  |  ')
                    : 'No guard on duty now')}
                  {post && post.safety ? ' · Safety: ' + post.safety : ''}
                </div>
              </div>
              {listItem && <span className={'pd-pill ' + STATUS[listItem.status].cls}>{STATUS[listItem.status].label}</span>}
              {main && main.phone && <a className="pd-chip" href={'tel:' + main.phone}>{Icon.phone} Call {main.name.split(' ')[0]}</a>}
              <button className="pd-icon-btn" onClick={() => loadPost(openId)} aria-label="Refresh">{Icon.refresh}</button>
            </div>
            <div className="sup-pane-body">
              {!post && <div className="pd-sys">Loading...</div>}
              {post && post.messages.length === 0 && <div className="pd-sys">No notes yet</div>}
              {post && post.messages.map(m => {
                const day = m.date !== lastDate ? m.date : null;
                lastDate = m.date;
                return (
                  <div key={m.ROWID} className="pd-msg-wrap">
                    {day && <div className="pd-day">{day}</div>}
                    <Message m={m} />
                  </div>
                );
              })}
              <div ref={endRef}></div>
            </div>
            {error && <div className="pd-error-bar">{error}</div>}
            <form className="pd-composer" onSubmit={send}>
              <label htmlFor="sup-msg" className="pd-hidden">Message to this post</label>
              <div className="pd-input">
                <input id="sup-msg" value={text} onChange={e => setText(e.target.value)} placeholder={'Message to ' + (post ? post.post : 'this post')} maxLength={255} autoComplete="off" />
              </div>
              <button className="pd-send" type="submit" disabled={busy || !text.trim()} aria-label="Send">{Icon.send}</button>
            </form>
          </>
        )}
        {!openId && error && <div className="pd-error-bar">{error}</div>}
      </main>
    </div>
  );
}
