import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAgencyPick } from '../agencyPick.js';
import { Icon, initials } from '../post/icons.jsx';
import { clock, compressImage, videoSeconds, recorderType, MAX_VIDEO_SECONDS, MAX_VIDEO_MB, MAX_VOICE_SECONDS } from '../post/media.js';
import '../post/post.css';
import './supervisor.css';
import Rail from './Rail.jsx';
import AddWork from '../post/AddWork.jsx';
import GroupChat from '../post/GroupChat.jsx';
import SafetySheet from '../post/SafetySheet.jsx';
import PostHistory, { forgetHistory } from '../post/PostHistory.jsx';
import { useSwipeReply, jumpTo } from '../post/swipe.jsx';
import VoiceNote, { RecordingRow, LockedRecorder, useVoiceRecorder } from '../post/VoiceNote.jsx';
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

function Message({ m, onReply }) {
  const me = useUser();
  // Swipe right to reply, like WhatsApp (Prem, 26 Oct).
  const swipe = useSwipeReply(() => onReply && onReply(m));
  if (m.kind === 'system') return <div className="pd-sys pd-sys-green">{Icon.check}{m.text}</div>;
  if (m.kind === 'system_red') return <div className="pd-sys pd-sys-red">{m.text}</div>;
  if (m.kind === 'work' && m.work) {
    const w = m.work;
    return (
      <div className={'pd-work sup-left ' + (w.expired && !w.finished ? 'pd-work-expired' : '')} {...swipe.handlers} style={swipe.style}>
        {swipe.icon}
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
    <div className={'pd-bubble ' + (mine ? 'pd-bubble-me sup-bubble-sup' : 'pd-bubble-other')} {...swipe.handlers} style={swipe.style}>
      {swipe.icon}
      <div className="pd-author">{m.kind === 'supervisor' || m.office ? supAuthor(m.author, me) : m.author}</div>
      {m.reply && <div className="pd-quote pd-quote-tap" onClick={() => jumpTo(m.reply.id)}><div className="pd-quote-name">{m.reply.author}</div><div className="pd-quote-text">{m.reply.text}</div></div>}
      {m.media && m.media.url && m.kind === 'photo' && <a href={m.media.url} target="_blank" rel="noreferrer"><img src={m.media.url} alt="Photo from the post" className="pd-media-img" /></a>}
      {m.media && m.media.url && m.kind === 'video' && <video src={m.media.url} controls playsInline preload="metadata" className="pd-media-img" />}
      {m.media && m.media.url && m.kind === 'voice' && <VoiceNote url={m.media.url} duration={m.media.duration} />}
      {m.media && (
        <div className="pd-media-tags">
          {m.media.source === 'camera' && <span className="pd-tag pd-tag-green">Taken at post</span>}
          {m.media.source === 'gallery' && <span className="pd-tag pd-tag-amber">From gallery</span>}
          {m.media.duration > 0 && m.kind !== 'voice' && <span className="pd-tag">{clock(m.media.duration)}</span>}
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
    // A reload keeps the open chat (Prem, 26 Oct: refresh went back to the list); this tab only.
    let reopen = null;
    try { reopen = sessionStorage.getItem('sup_chat'); } catch { /* private mode */ }
    const id = initialPost || remember('sup_open', null) || reopen;
    keep('sup_open', null);
    return id;
  });
  const [post, setPost] = useState(null);
  // Phone (Prem, 25 Oct: "like WhatsApp"): the list fills the screen, a post opens over it with ← back,
  // and the phone's own back button closes the chat instead of leaving the app.
  const phone = () => window.matchMedia('(max-width:700px)').matches;
  // One browser history step while a chat is open on a phone, however it was opened (list, live board,
  // notification): phone Back closes the screen on top (history / safety / work form / + menu) first,
  // then the chat. The ← button closes the chat at once and takes that step away quietly.
  const ignorePop = useRef(false);
  const closeTop = useRef(() => false);
  const addStep = () => { try { window.history.pushState({ supChat: true }, ''); } catch { /* old browser */ } };
  const openPost = id => setOpenId(id);
  useEffect(() => {
    try { if (openId) sessionStorage.setItem('sup_chat', openId); else sessionStorage.removeItem('sup_chat'); } catch { /* private mode */ }
    if (!openId) return;
    // "#supervisor/<post>" (a notification) would open the same chat again on the next visit.
    if (window.location.hash.startsWith('#supervisor/')) { try { window.history.replaceState(window.history.state, '', '#supervisor'); } catch { /* old browser */ } }
    if (phone() && !(window.history.state && window.history.state.supChat)) addStep();
  }, [openId]);
  const closePost = () => {
    setOpenId(null);
    if (window.history.state && window.history.state.supChat) { ignorePop.current = true; window.history.back(); }
  };
  useEffect(() => {
    const onBack = () => {
      if (ignorePop.current) { ignorePop.current = false; return; }
      if (closeTop.current()) { if (phone()) addStep(); return; }
      setOpenId(null);
    };
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
    if (!id || id === 'group') return; // the team group loads itself (GroupChat)
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
  // Mic like WhatsApp: hold (slide to cancel) or touch once (🗑 / Pause / ➤). VoiceNote.jsx
  const rec = useVoiceRecorder((blob, secs) => upload(blob, 'voice', 'mic', secs), setError);
  // + menu (Prem, 25 Oct): work update and vehicle entry from the office too.
  const [sheet, setSheet] = useState(false);
  const [showBreaks, setShowBreaks] = useState(false);
  const [replyTo, setReplyTo] = useState(null);
  useEffect(() => { setReplyTo(null); }, [openId]);
  const [showPick, setShowPick] = useState(false);
  const [showFind, setShowFind] = useState(false);
  // What the guard sees at the post, the office sees too (Prem, 25 Oct): Safety today, works going on, history.
  const [view, setView] = useState(() => { try { return sessionStorage.getItem('sup_view') === 'history' ? 'history' : null; } catch { return null; } }); // 'safety' | 'history'
  const firstOpen = useRef(true);
  useEffect(() => { if (firstOpen.current) { firstOpen.current = false; return; } setView(null); }, [openId]);
  // A reload on Duty history stays there (Prem, 26 Oct).
  useEffect(() => { try { if (view === 'history') sessionStorage.setItem('sup_view', 'history'); else sessionStorage.removeItem('sup_view'); } catch { /* private mode */ } if (view !== 'history') forgetHistory(); }, [view]);
  const [addingWork, setAddingWork] = useState(false);
  useEffect(() => { setSheet(false); setAddingWork(false); }, [openId]);
  async function saveWork(form) {
    await api.supWork(openId, form);
    await loadPost(openId);
    loadList();
  }
  async function upload(blob, kind, source, duration) {
    setBusy(true);
    setError('');
    try {
      await api.supMedia(openId, blob, { kind, source, duration, reply_to: replyTo ? replyTo.ROWID : null });
      setReplyTo(null);
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

  async function send(e) {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.supMessage(openId, text, replyTo ? replyTo.ROWID : null);
      setReplyTo(null);
      setText('');
      await loadPost(openId);
      loadList();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  closeTop.current = () => {
    if (view) { setView(null); return true; }
    if (addingWork) { setAddingWork(false); return true; }
    if (sheet) { setSheet(false); return true; }
    return false;
  };

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
  // Team group of the agency in view: a shift incharge's own; Branch Admin and above the picked one.
  const user = useUser();
  const groupAgencyName = pickAgency ? ((branchAgencies.find(a => String(a.ROWID) === String(ag)) || {}).agency_name || '') : ((user && user.agencyName) || '');
  const groupAgency = pickAgency ? ag : '';
  const groupApi = useMemo(() => ({
    load: () => api.supGroup(branch, groupAgency),
    send: (text, replyTo) => api.supGroupSend(branch, groupAgency, text, replyTo),
    media: (blob, opts) => api.supGroupMedia(branch, groupAgency, blob, opts)
  }), [branch, groupAgency]);
  const agName = pickAgency ? ((branchAgencies.find(a => String(a.ROWID) === String(ag)) || {}).agency_name || '') : '';
  const listItem = list && list.find(p => p.ROWID === openId);
  const main = post && (post.guards.find(g => g.main) || null);
  let lastDate = '';

  return (
    <div className={'pd sup sup-inbox' + (openId ? ' sup-inbox-chat' : '')}>
      <Rail active="posts" />

      <aside className="sup-list">
        <div className={'sup-list-head' + (showPick ? ' sup-pick-open' : '') + (showFind || search ? ' sup-find-open' : '')}>
          {/* Phone (Prem, 26 Oct: branch, agency and search took half the screen): one short line,
              📍 opens the branch / agency pickers, 🔍 the search box. The computer keeps them all open. */}
          <div className="sup-compact">
            <button className="sup-place" onClick={() => setShowPick(v => !v)} aria-expanded={showPick}>
              <span className="sup-place-text">📍 {branchName || 'Branch'}{agName ? ' · ' + agName : ''}</span><span>▾</span>
            </button>
            <button className="pd-icon-btn" onClick={() => setShowFind(v => !v)} aria-label="Search post or guard">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"></circle><path d="M20 20l-3.5-3.5"></path></svg>
            </button>
            <button className="pd-icon-btn" onClick={loadList} aria-label="Refresh">{Icon.refresh}</button>
          </div>
          <div className="pd-row-between sup-head-row">
            <div className="pd-title">Posts</div>
            {!pushOn && branch && <button className="pd-chip pd-chip-primary" onClick={turnOnPush}>{Icon.bell} Turn on notifications</button>}
            <button className="pd-icon-btn sup-head-refresh" onClick={loadList} aria-label="Refresh">{Icon.refresh}</button>
          </div>
          <select className="pd-search sup-pick" value={branch} onChange={e => { setBranch(e.target.value); setShowPick(false); }} aria-label="Branch">
            {branches.map(b => <option key={b.ROWID} value={b.ROWID}>{b.branch_name}{b.area ? ' (' + b.area + ')' : ''} · {b.city}</option>)}
          </select>
          {pickAgency && branchAgencies.length > 0 && (
            <select className="pd-search sup-pick" value={ag} onChange={e => { chooseAgency(e.target.value); setShowPick(false); }} aria-label="Agency">
              {branchAgencies.map(a => <option key={a.ROWID} value={a.ROWID}>{a.agency_name}</option>)}
            </select>
          )}
          <input className="pd-search sup-find" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search post or guard" aria-label="Search post or guard" />
          <div className="pd-quick pd-wrap">
            {[['all', 'All'], ['alerts', 'Alerts'], ['break', 'On break'], ['unread', 'Unread']].map(([k, label]) => (
              <button key={k} className={'pd-chip pd-chip-sm' + (filter === k ? ' pd-chip-primary' : '')} onClick={() => setFilter(k)}>{label} {counts[k]}</button>
            ))}
          </div>
        </div>
        <div className="sup-list-body">
          {/* The agency's team group, pinned on top (Prem, 26 Oct: "IPF Schedule"). */}
          {branch && groupAgencyName && (
            <button className={'sup-item sup-item-group' + (openId === 'group' ? ' sup-item-on' : '')} onClick={() => openPost('group')}>
              <span className="pd-avatar pd-avatar-sm sup-group-avatar">👥</span>
              <span className="pd-grow sup-item-main">
                <b>{groupAgencyName} Schedule</b>
                <span className="pd-small pd-muted">Team group · all {groupAgencyName} guards and the office</span>
              </span>
            </button>
          )}
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
        {openId === 'group' && <GroupChat api={groupApi} fill onBack={closePost} />}
        {openId && openId !== 'group' && (
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
              {/* 📞 like WhatsApp (Prem, 26 Oct): the guard on duty and Safety today, each with a call button. */}
              <button className="pd-icon-btn" onClick={() => setView('safety')} aria-label="Call the guard or the safety person">{Icon.phone}</button>
              <button className="pd-icon-btn" onClick={() => setView('history')} aria-label="Duty history for this post">{Icon.history}</button>
              <button className="pd-icon-btn" onClick={() => loadPost(openId)} aria-label="Refresh">{Icon.refresh}</button>
            </div>
            <div className="sup-post-bar">
              {post && post.openWorks && post.openWorks.some(w => w.expired) ? (
                <div className="pd-strip pd-strip-red"><span><b>Permit expired {post.openWorks.find(w => w.expired).to}</b> · {post.openWorks.find(w => w.expired).contractor} still working</span></div>
              ) : post && post.openWorks && post.openWorks.length > 0 && (
                <div className="pd-strip pd-strip-amber"><span><b>{post.openWorks.length} work still going on</b> · {post.openWorks.map(w => w.contractor).join(', ')}</span></div>
              )}
            </div>
            {/* Breaks at this post, like the guard sees them on his page (Prem, 25 Oct). */}
            {post && post.breaks && post.breaks.length > 0 && (
              <div className="sup-breaks">
                {post.breaks.filter(x => x.active).map(x => (
                  <div key={x.ROWID} className={'pd-break-card ' + (x.status === 'alone' || x.status === 'declined' ? 'pd-break-red' : x.status === 'asked' ? 'pd-break-amber' : 'pd-break-green')}>
                    <span className="pd-avatar pd-avatar-sm">{initials(x.guard)}</span>
                    <div className="pd-grow">
                      <b>{x.guard} · {x.typeLabel} break{x.start ? ' · since ' + x.start + ' · ' + x.minutes + ' min' : ''}</b>
                      <div className="pd-small">
                        {x.status === 'asked' ? 'Asked ' + x.cover + ' to cover · ' + x.asked + ' · still at the post'
                          : x.status === 'declined' ? x.cover + " can't cover · still at the post"
                            : x.status === 'alone' ? 'No one covering · post empty'
                              : x.cover + (x.mode === 'go' ? ' came to the post' : ' watching from ' + (x.coverPost || 'his post'))}
                      </div>
                    </div>
                  </div>
                ))}
                {post.breaks.some(x => !x.active) && (
                  <button className="pd-link pd-link-left" onClick={() => setShowBreaks(v => !v)}>
                    {showBreaks ? '▾' : '▸'} Breaks today ({post.breaks.filter(x => !x.active).length})
                  </button>
                )}
                {showBreaks && post.breaks.filter(x => !x.active).map(x => (
                  <div key={x.ROWID} className="sup-break-row">
                    <span>{x.start || x.asked}{x.end ? ' – ' + x.end : ''}</span>
                    <b>{x.guard}</b>
                    <span>{x.typeLabel} · {x.minutes} min</span>
                    <span className="pd-muted">{x.cover ? 'cover ' + x.cover : 'no cover'}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="sup-pane-body">
              {!post && <div className="pd-sys">Loading...</div>}
              {post && post.messages.length === 0 && <div className="pd-sys">No notes yet</div>}
              {post && post.messages.map(m => {
                const day = m.date !== lastDate ? m.date : null;
                lastDate = m.date;
                return (
                  <div key={m.ROWID} id={'msg-' + m.ROWID} className="pd-msg-wrap">
                    {day && <div className="pd-day">{day}</div>}
                    <Message m={m} onReply={x => { setReplyTo(x); const box = document.getElementById('sup-msg'); if (box) box.focus(); }} />
                  </div>
                );
              })}
              <div ref={endRef}></div>
            </div>
            {error && <div className="pd-error-bar">{error}</div>}
            {replyTo && (
              <div className="pd-reply-bar">
                <div className="pd-row-between">
                  <div className="pd-quote-name">Replying to {replyTo.mine ? 'yourself' : replyTo.author}</div>
                  <button className="pd-x" onClick={() => setReplyTo(null)} aria-label="Cancel reply">×</button>
                </div>
                <div className="pd-quote-text">{replyTo.kind === 'work' ? 'Work update · ' + replyTo.text : replyTo.text || (replyTo.kind === 'voice' ? 'Voice note' : replyTo.kind === 'video' ? 'Video' : 'Photo')}</div>
              </div>
            )}
            <form className="pd-composer" onSubmit={send}>
              {rec.locked && <LockedRecorder r={rec} />}
              {rec.recording && !rec.locked && <RecordingRow secs={rec.secs} slide={rec.slide} />}
              <button type="button" className="pd-plus" onClick={() => setSheet(true)} aria-label="Add work update or vehicle entry" hidden={rec.recording}>{Icon.plus}</button>
              <label htmlFor="sup-msg" className="pd-hidden">Message to this post</label>
              <div className="pd-input" hidden={rec.recording}>
                <input id="sup-msg" value={text} onChange={e => setText(e.target.value)} placeholder={'Message to ' + (post ? post.post : 'this post')} maxLength={255} autoComplete="off" />
                <button type="button" className="pd-in-btn" onClick={() => galleryInput.current.click()} disabled={busy} aria-label="Attach photo or video from gallery">{Icon.clip}</button>
                <button type="button" className="pd-in-btn" onClick={() => photoInput.current.click()} disabled={busy} aria-label="Take a photo">{Icon.camera}</button>
              </div>
              {text.trim()
                ? <button className="pd-send" type="submit" disabled={busy} aria-label="Send">{Icon.send}</button>
                : !rec.locked && <button type="button" className={'pd-mic' + (rec.recording ? ' pd-mic-on' : '')} {...rec.micProps} disabled={busy} aria-label="Touch or hold to record a voice note">{Icon.mic}</button>}
              <input ref={photoInput} type="file" accept="image/*" capture="environment" className="pd-file" onChange={onPhotoTaken} />
              <input ref={galleryInput} type="file" accept="image/*,video/*" className="pd-file" onChange={onGalleryPick} />
            </form>
            {sheet && (
              <div className="pd-dim" onClick={() => setSheet(false)}>
                <div className="pd-sheet" onClick={e => e.stopPropagation()}>
                  <div className="pd-grab"></div>
                  <div className="pd-sheet-title">Add to {post ? post.post : 'this post'}</div>
                  <button className="pd-option pd-option-primary" onClick={() => { setSheet(false); setAddingWork(true); }}>
                    {Icon.wrench}<span><b>Work update</b><span>Contractor, persons, permit time</span></span>
                  </button>
                  {post && post.vehicleEntry && (
                    <a className="pd-option" href={'#vehicles/add/' + openId}>
                      {Icon.car}<span><b>Vehicle entry</b><span>Employee, visitor, vendor IN / OUT</span></span>
                    </a>
                  )}
                </div>
              </div>
            )}
            {view === 'safety' && (
              <div className="pd-dim" onClick={() => setView(null)}>
                <div className="pd-sheet" onClick={e => e.stopPropagation()}>
                  <div className="pd-grab"></div>
                  {post && post.guards.length > 0 && <div className="pd-sheet-title">On duty now</div>}
                  {post && post.guards.map(g => (
                    <div key={g.name + g.shift} className="pd-safety">
                      <div className="pd-safety-shift"><b>{g.shift}</b><span>guard</span></div>
                      <div className="pd-grow"><div className="pd-safety-name">{g.name}</div>{g.phone && <div className="pd-muted pd-small">{g.phone}</div>}</div>
                      {g.phone && <a className="pd-call" href={'tel:' + g.phone} aria-label={'Call ' + g.name}>{Icon.phone}</a>}
                    </div>
                  ))}
                  <SafetySheet token="" post={openId} readOnly onClose={() => setView(null)} />
                </div>
              </div>
            )}
            {view === 'history' && (
              <div className="sup-work">
                <PostHistory token="" post={openId} postName={post ? post.post : ''} onClose={() => setView(null)} />
              </div>
            )}
            {addingWork && (
              <div className="sup-work">
                <AddWork postName={post ? post.post : ''} onSave={saveWork} onClose={() => setAddingWork(false)} />
              </div>
            )}
          </>
        )}
        {!openId && error && <div className="pd-error-bar">{error}</div>}
      </main>
    </div>
  );
}
