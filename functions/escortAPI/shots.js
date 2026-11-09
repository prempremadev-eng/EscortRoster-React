'use strict';

// 📤 Screenshot drop (Prem, 9 Nov): a phone page with no login where Prem uploads app screenshots with a
// title, so Claude can collect them for the manager presentation. Open with the secret in Settings
// 'shot_key' (#shots/<key>). Files live in Stratus under shots/, with shots/index.json as the list.
const BUCKET = (process.env.MEDIA_BUCKET || 'escortcardaccess-media');
const INDEX = 'shots/index.json';
const crypto = require('crypto');

module.exports = (app, { catalyst, fail, getSetting }) => {
  const admin = req => catalyst.initialize(req, { scope: 'admin' });
  const ok = (res, data) => res.status(200).json({ status: 'success', data });

  async function allowed(catalystApp, k) {
    const row = await getSetting(catalystApp.zcql(), 'shot_key');
    const key = row && row.setting_value ? String(row.setting_value) : '';
    if (!key || String(k || '') !== key) throw new Error('Not allowed.');
  }
  async function readIndex(bucket) {
    try {
      const chunks = [];
      for await (const c of await bucket.getObject(INDEX)) chunks.push(Buffer.from(c));
      return JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch (e) {
      return [];
    }
  }
  const writeIndex = (bucket, list) => bucket.putObject(INDEX, Buffer.from(JSON.stringify(list)), { contentType: 'application/json', overwrite: true });
  const signed = async (bucket, key) => { try { return (await bucket.generatePreSignedUrl(key, 'GET', { expiryIn: '3600' })).signature; } catch (e) { return ''; } };

  app.post('/shotUpload', async (req, res) => {
    try {
      const catalystApp = admin(req);
      await allowed(catalystApp, req.body.k);
      const m = String(req.body.photo || '').match(/^data:image\/jpeg;base64,(.+)$/);
      if (!m) throw new Error('No photo.');
      const photo = Buffer.from(m[1], 'base64');
      if (photo.length > 1800000) throw new Error('Photo too big.');
      const title = String(req.body.title || '').replace(/[<>]/g, '').trim().slice(0, 120);
      const bucket = catalystApp.stratus().bucket(BUCKET);
      const key = 'shots/' + Date.now() + '-' + crypto.randomBytes(3).toString('hex') + '.jpg';
      await bucket.putObject(key, photo, { contentType: 'image/jpeg' });
      const list = await readIndex(bucket);
      list.push({ key, title, at: new Date(Date.now() + 330 * 60000).toISOString().slice(0, 16).replace('T', ' ') });
      await writeIndex(bucket, list);
      ok(res, { count: list.length });
    } catch (err) {
      fail(res, err);
    }
  });

  app.get('/shotList', async (req, res) => {
    try {
      const catalystApp = admin(req);
      await allowed(catalystApp, req.query.k);
      const bucket = catalystApp.stratus().bucket(BUCKET);
      const list = await readIndex(bucket);
      const items = [];
      for (const s of list) items.push({ ...s, url: await signed(bucket, s.key) });
      ok(res, items);
    } catch (err) {
      fail(res, err);
    }
  });

  // Change a title (Claude names them after looking).
  app.post('/shotTitle', async (req, res) => {
    try {
      const catalystApp = admin(req);
      await allowed(catalystApp, req.body.k);
      const bucket = catalystApp.stratus().bucket(BUCKET);
      const list = await readIndex(bucket);
      const s = list.find(x => x.key === String(req.body.key || ''));
      if (!s) throw new Error('Not found.');
      s.title = String(req.body.title || '').replace(/[<>]/g, '').trim().slice(0, 120);
      await writeIndex(bucket, list);
      ok(res, { title: s.title });
    } catch (err) {
      fail(res, err);
    }
  });

  // Take one off the list (the file stays in storage; nothing is lost by a wrong tap).
  app.post('/shotRemove', async (req, res) => {
    try {
      const catalystApp = admin(req);
      await allowed(catalystApp, req.body.k);
      const bucket = catalystApp.stratus().bucket(BUCKET);
      const list = (await readIndex(bucket)).filter(s => s.key !== String(req.body.key || ''));
      await writeIndex(bucket, list);
      ok(res, { count: list.length });
    } catch (err) {
      fail(res, err);
    }
  });
};
