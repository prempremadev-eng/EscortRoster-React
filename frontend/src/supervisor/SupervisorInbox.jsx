import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAgencyPick } from '../agencyPick.js';
import { Icon, initials } from '../post/icons.jsx';
import { clock, compressImage, videoSeconds, recorderType, MAX_VIDEO_SECONDS, MAX_VIDEO_MB, MAX_VOICE_SECONDS } from '../post/media.js';
import '../post/post.css';
import './supervisor.css';
import Rail from './Rail.jsx';
import { useUser } from '../auth/user.js';

// "Name · Role" since 25 Oct; older messages have only the name and were all from supervisors.
// "You" only for my own messages, not every office message.
function supAuthor(author, me) {
  const at = String(author || '').lastIndexOf(' · ');
  const name = at < 0 ? author : author.slice(0, at);
  const role = at < 0 ? 'Supervisor' : author.slice(at + 3);
  return (me && name === me.name ? 'You' : name) + ' · ' + role;
}

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

// The branch this browser used last, if this login may see it; else the first one.
function pickBranch(list) {
  const last = String(remember('sup_branch', ''));
  return list.some(b => String(b.ROWID) === last) ? last : (list[0] ? String(list[0].ROWID) : '');
}

function keyToBytes(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}
const deviceType = () => (/iPhone|iPad|iPod/.test(navigator.userAgent) ? 'iphone' : /Android/.test(navigator.userAgent) ? 'android' : 'other');

function Message({ m }) {
  const me = useUser();
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
  const mine = (m.kind === 'supervisor' || m.office) && m.mine;
  return (
    <div className={'pd-bubble ' + (mine ? 'pd-bubble-me sup-bubble-sup' : 'pd-bubble-other')}>
      <div className="pd-author">{m.kind === 'supervisor' || m.office ? supAuthor(m.author, me) : m.author}</div>
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
export default function SupervisorInbox({ initialPost }) {
  const [branches, setBranches] = useState([]);
  // Starts empty: the remembered branch is used only if it is in this login's area.
  const [branch, setBranch] = useState('');
  const [list, setList] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  // A post picked on the live board opens here once.
  const [openId, setOpenId] = useState(() => {
    const id = initialPost || remember('sup_open', null);
    keep('sup_open', null);
    return id;
  });
  const [post, setPost] = useState(null);
  // Phone (Prem, 25 Oct: "like WhatsApp"): the list fills the screen, a post opens over it with ← back,
  // and the phone's own back button closes the chat instead of leaving the app.
  const phone = () => window.matchMedia('(max-width:700px)').matches;
  const openPost = id => {
    if (phone() && !openId) { try { window.history.pushState({ supChat: id }, ''); } catch { /* old browser */ } }
    setOpenId(id);
  };
  const closePost = () => {
    if (window.history.state && window.history.state.supChat) window.history.back();
    else setOpenId(null);
  };
  useEffect(() => {
    const onBack = () => { if (!(window.history.state && window.history.state.supChat)) setOpenId(null); };
    window.addEventListener('popstate', onBack);
    return () => window.removeEventListener('popstate', onBack);
  }, []);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const seen = useRef(remember('sup_seen', {}));
  const endRef = useRef(null);

  useEffect(() => {
    api.getPosts().then(r => {
      const b = r.data.branches;
      setBranches(b);
      setAgencies(r.data.agencies || []);
      setBranch(pickBranch(b));
    }).catch(err => setError(err.message));
  }, []);

  const [agencies, setAgencies] = useState([]);
  const { pickAgency, branchAgencies, ag, chooseAgency } = useAgencyPick(branch, agencies);
  const loadList = useCallback(async () => {
    if (!branch) return;
    try {
      setList((await api.supInbox(branch, seen.current, ag)).data);
    } catch (err) {
      setError(err.message);
    }
  }, [branch, ag]);

  const loadPost = useCallback(async id => {
    if (!id) return;
    try {
      const d = (await api.supPost(id)).data;
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
  }, []);

  const firstBranch = useRef(true);
  useEffect(() => {
    if (branch) keep('sup_branch', branch);
    if (!firstBranch.current) { setOpenId(null); setPost(null); }
    if (branch) firstBranch.current = false;
    loadList();
  }, [branch, loadList]);
  useEffect(() => { if (openId) { setPost(null); loadPost(openId).then(loadList); } }, [openId, loadPost, loadList]);
  useEffect(() => { if (endRef.current) endRef.current.scrollIntoView({ block: 'end' }); }, [post]);

  // No timer: every list load costs Data Store reads. The page refreshes when a notification
  // for this branch arrives (sw.js tells it), when the supervisor comes back to the tab, or with 🔄.
  useEffect(() => {
    // The open chat first (it marks alerts seen and messages read), then the list, so the list
    // does not show "1 alert / 1 unread" for what is already on screen. Its notification closes too.
    const onPush = async () => {
      if (openId) {
        await loadPost(openId);
        try {
          const reg = await navigator.serviceWorker.ready;
          (await reg.getNotifications({ tag: 'sup-' + openId })).forEach(n => n.close());
        } catch {
          // no service worker here: nothing to close
        }
      }
      loadList();
    };
    const onShow = () => { if (document.visibilityState === 'visible') onPush(); };
    window.addEventListener('guard-push', onPush);
    document.addEventListener('visibilitychange', onShow);
    return () => { window.removeEventListener('guard-push', onPush); document.removeEventListener('visibilitychange', onShow); };
  }, [loadList, loadPost, openId]);

  // Notifications for this branch on this browser (asked once per branch).
  const pushKey = 'sup_push_' + branch;
  const [pushOn, setPushOn] = useState(() => remember(pushKey, false));
  useEffect(() => { setPushOn(remember(pushKey, false)); }, [pushKey]);
  async function turnOnPush() {
    setError('');
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('This browser cannot get notifications.');
      if (await Notification.requestPermission() !== 'granted') throw new Error('Notifications are blocked. Allow them for this site in the browser settings.');
      const reg = await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      const { vapidPublicKey } = (await api.supVapid()).data;
      const subscription = await reg.pushManager.getSubscription()
        || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(vapidPublicKey) });
      await api.supSubscribe(branch, subscription.toJSON(), deviceType());
      keep(pushKey, true);
      setPushOn(true);
    } catch (err) {
      setError(err.message);
    }
  }

  // Photo, video and voice from the office (Prem, 25 Oct: the same message box as the guard's page).
  const photoInput = useRef(null);
  const galleryInput = useRef(null);
  const voiceRec = useRef(null);
  const holdingMic = useRef(false);
  const [voice, setVoice] = useState(null);
  async function upload(blob, kind, source, duration) {
    setBusy(true);
    setError('');
    try {
      await api.supMedia(openId, blob, { kind, source, duration });
      await loadPost(openId);
      loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  async function onPhotoTaken(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try { await upload(await compressImage(file), 'photo', 'camera', 0); } catch (err) { setError(err.message); }
  }
  async function onGalleryPick(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (file.type.startsWith('image/')) return upload(await compressImage(file), 'photo', 'gallery', 0);
      if (!file.type.startsWith('video/')) return setError('Pick a photo or a video.');
      const secs = await videoSeconds(file);
      if (secs > MAX_VIDEO_SECONDS + 1) return setError('Video must be ' + MAX_VIDEO_SECONDS + ' seconds or less.');
      if (file.size > MAX_VIDEO_MB * 1048576) return setError('Video is too big (max ' + MAX_VIDEO_MB + ' MB).');
      upload(file, 'video', 'gallery', Math.round(secs));
    } catch (err) {
      setError(err.message);
    }
  }
  // Mic: hold to record, let go to send (WhatsApp style, like the guard's page).
  async function voiceDown(e) {
    e.preventDefault();
    holdingMic.current = true;
    const type = recorderType('voice');
    if (type === null || !navigator.mediaDevices) return setError('This browser cannot record voice here.');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks = [];
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : {});
      const began = Date.now();
      rec.ondataavailable = ev => { if (ev.data.size) chunks.push(ev.data); };
      rec.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        clearInterval(rec.timer);
        setVoice(null);
        const secs = (Date.now() - began) / 1000;
        if (rec.cancelled || secs < 1) return;
        upload(new Blob(chunks, { type: (rec.mimeType || type || 'audio/webm').split(';')[0] }), 'voice', 'mic', Math.round(secs));
      };
      rec.timer = setInterval(() => {
        const secs = (Date.now() - began) / 1000;
        setVoice(secs);
        if (secs >= MAX_VOICE_SECONDS) rec.stop();
      }, 250);
      voiceRec.current = rec;
      setVoice(0);
      rec.start();
      if (!holdingMic.current) voiceUp(true);
    } catch {
      setError('Microphone is blocked. Allow the microphone for this site.');
    }
  }
  function voiceUp(cancel) {
    holdingMic.current = false;
    const rec = voiceRec.current;
    voiceRec.current = null;
    if (!rec || rec.state !== 'recording') return;
    rec.cancelled = cancel === true;
    rec.stop();
  }

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.supMessage(openId, text);
      setText('');
      await loadPost(openId);
      loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
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
    <div className={'pd sup sup-inbox' + (openId ? ' sup-inbox-chat' : '')}>
      <Rail active="posts" />

      <aside className="sup-list">
        <div className="sup-list-head">
          <div className="pd-row-between">
            <div className="pd-title">Posts</div>
            {!pushOn && branch && <button className="pd-chip pd-chip-primary" onClick={turnOnPush}>{Icon.bell} Turn on notifications</button>}
            <button className="pd-icon-btn" onClick={loadList} aria-label="Refresh">{Icon.refresh}</button>
          </div>
          <select className="pd-search" value={branch} onChange={e => setBranch(e.target.value)} aria-label="Branch">
            {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{b.branch_name}{b.area ? ' (' + b.area + ')' : ''} · {b.city}</option>)}
          </select>
          {pickAgency && branchAgencies.length > 0 && (
            <select className="pd-search" value={ag} onChange={e => chooseAgency(e.target.value)} aria-label="Agency">
              {branchAgencies.map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
            </select>
          )}
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
            <button key={p.ROWID} className={'sup-item' + (p.ROWID === openId ? ' sup-item-on' : '') + (p.status === 'alert' || p.status === 'empty' ? ' sup-item-red' : '')} onClick={() => openPost(p.ROWID)}>
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
              <button className="sup-back" onClick={closePost} aria-label="Back to the posts">←</button>
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
              {main && main.phone && <a className="pd-chip" href={'tel:' + main.phone}>{Icon.phone}<span className="sup-call-name"> Call {main.name.split(' ')[0]}</span></a>}
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
            {voice !== null && (
              <div className="pd-voice-bar"><span className="pd-voice-dot"></span>Recording {clock(voice)} · let go to send</div>
            )}
            <form className="pd-composer" onSubmit={send}>
              <label htmlFor="sup-msg" className="pd-hidden">Message to this post</label>
              <div className="pd-input">
                <input id="sup-msg" value={text} onChange={e => setText(e.target.value)} placeholder={'Message to ' + (post ? post.post : 'this post')} maxLength={255} autoComplete="off" />
                <button type="button" className="pd-in-btn" onClick={() => galleryInput.current.click()} disabled={busy} aria-label="Attach photo or video from gallery">{Icon.clip}</button>
                <button type="button" className="pd-in-btn" onClick={() => photoInput.current.click()} disabled={busy} aria-label="Take a photo">{Icon.camera}</button>
              </div>
              {text.trim()
                ? <button className="pd-send" type="submit" disabled={busy} aria-label="Send">{Icon.send}</button>
                : <button type="button" className={'pd-mic' + (voice !== null ? ' pd-mic-on' : '')} onPointerDown={voiceDown} onPointerUp={() => voiceUp(false)} onContextMenu={e => e.preventDefault()} disabled={busy} aria-label="Hold to record a voice note">{Icon.mic}</button>}
              <input ref={photoInput} type="file" accept="image/*" capture="environment" className="pd-file" onChange={onPhotoTaken} />
              <input ref={galleryInput} type="file" accept="image/*,video/*" className="pd-file" onChange={onGalleryPick} />
            </form>
          </>
        )}
        {!openId && error && <div className="pd-error-bar">{error}</div>}
      </main>
    </div>
  );
}
