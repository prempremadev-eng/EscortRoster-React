import { useEffect, useState } from 'react';
import { api } from '../api.js';

// The push service wants the public key as bytes, but we keep it as base64url text.
function keyToBytes(base64url) {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), c => c.charCodeAt(0));
}

function deviceType() {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return 'iphone';
  if (/Android/.test(ua)) return 'android';
  return 'other';
}

const DEVICE_NAME = { android: '📱 Android', iphone: '📱 iPhone', other: '💻 Computer' };
const RESULT = { sent: '✅ sent', failed: '❌ failed', removed: '🗑 old, removed' };

// One line per device, e.g. "📱 Android ✅ sent · 💻 Computer ✅ sent".
function testReport(devices) {
  const line = devices.map(d => DEVICE_NAME[d.device] + ' ' + RESULT[d.result]).join(' · ');
  return '📨 ' + line + '. A sent message should appear in a few seconds. If this phone shows ✅ but nothing appears, check the phone\'s notification settings for Chrome.';
}

// iPhone allows web push only for an app opened from the Home Screen (iOS 16.4+).
const isIphoneBrowserTab = () => deviceType() === 'iphone' && !window.navigator.standalone;

// Guard's phone, one time: open the secret link → Allow → this phone gets the IN notifications.
export default function GuardSetup({ token }) {
  const [info, setInfo] = useState(null);
  const [step, setStep] = useState('loading');
  const [message, setMessage] = useState('');

  useEffect(() => {
    api.guardInfo(token)
      .then(r => {
        setInfo(r.data);
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
          setStep(isIphoneBrowserTab() ? 'iphoneHome' : 'unsupported');
        } else if (Notification.permission === 'denied') {
          setStep('blocked');
        } else {
          setStep('ready');
        }
      })
      .catch(err => {
        setMessage(err.message);
        setStep('error');
      });
  }, [token]);

  async function allow() {
    setStep('working');
    setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStep('blocked');
        return;
      }
      const reg = await navigator.serviceWorker.register('sw.js');
      await navigator.serviceWorker.ready;
      const subscription = await reg.pushManager.getSubscription()
        || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyToBytes(info.vapidPublicKey) });
      await api.saveSubscription(token, subscription.toJSON(), deviceType());
      setStep('done');
    } catch (err) {
      console.error('Push setup failed:', err);
      setMessage(err.message);
      setStep('ready');
    }
  }

  async function test() {
    setMessage('');
    try {
      const r = (await api.testPush(token)).data;
      setMessage(r.phones ? testReport(r.devices) : 'No phone is set up yet. Tap Allow first.');
    } catch (err) {
      setMessage(err.message);
    }
  }

  return (
    <>
      <div className="titlebar">
        <h1>🔔 Duty Notifications</h1>
      </div>

      <div className="setup">
        {step === 'loading' && <div className="loading-message">Loading...</div>}
        {step === 'error' && <div className="setup-card bad">❌ {message}</div>}

        {info && step !== 'error' && (
          <div className="setup-card">
            <div className="setup-hello">Hi <b>{info.guard_name}</b> 👋</div>
            <p>When your access card shows <b>IN</b>, this phone will get a message with your seat or post for the day.</p>

            {step === 'ready' && <button className="btn setup-btn" onClick={allow}>🔔 Allow notifications</button>}
            {step === 'working' && <button className="btn setup-btn" disabled>Please wait...</button>}

            {step === 'done' && (
              <>
                <div className="setup-ok">✅ Done! This phone will get your duty notifications.</div>
                <button className="btn secondary setup-btn" onClick={test}>📨 Send test notification</button>
              </>
            )}

            {step === 'blocked' && (
              <div className="setup-card bad">
                Notifications are blocked for this site. Open the browser's site settings, allow Notifications, then reload this page.
              </div>
            )}
            {step === 'iphoneHome' && (
              <div className="setup-card bad">
                iPhone: tap <b>Share</b> → <b>Add to Home Screen</b>, then open the app from the Home Screen icon and use this link again. (iOS 16.4 or newer.)
              </div>
            )}
            {step === 'unsupported' && (
              <div className="setup-card bad">This browser cannot get notifications. Please open the link in Chrome.</div>
            )}

            {message && <div className="setup-msg">{message}</div>}
          </div>
        )}
      </div>
    </>
  );
}
