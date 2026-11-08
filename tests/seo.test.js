/* Test voor kit/seo_build.js: bouwt de website met de prijsdata uit de repo. Draaien: node --test tests/*.test.js */
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {execFileSync} = require('child_process');

const ROOT = path.join(__dirname, '..');

test('website bouwen: alles ingevuld, één h1, unieke titels, sitemap zonder 404', () => {
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-'));
  execFileSync(process.execPath, [path.join(ROOT, 'kit', 'seo_build.js'), path.join(ROOT, 'data', 'data.b64'), path.join(ROOT, 'site'), out, 'https://voorbeeld.nl/'],
    {stdio: 'pipe'});
  const pages = fs.readdirSync(out).filter(f => f.endsWith('.html'));
  assert.ok(pages.includes('goedkoopste-supermarkt.html') && pages.includes('index.html'));
  assert.ok(!pages.some(f => f.startsWith('_')), 'gedeelde stukken worden niet gepubliceerd');
  const titles = new Set();
  for (const f of pages){
    const h = fs.readFileSync(path.join(out, f), 'utf8');
    assert.ok(!/\{\{[A-Z]+\}\}|<!--GEN:/.test(h), f + ': alles ingevuld');
    assert.strictEqual((h.match(/<h1[\s>]/g) || []).length, 1, f + ': precies één h1');
    const t = (h.match(/<title>([^<]*)<\/title>/) || [])[1];
    assert.ok(t && !titles.has(t), f + ': eigen titel'); titles.add(t);
    if (f !== '404.html'){
      assert.ok(h.includes('<link rel="canonical" href="https://voorbeeld.nl/'), f + ': canonical op het opgegeven adres');
      assert.ok(/<meta name="description" content="[^"]{50,160}"/.test(h), f + ': beschrijving van 50 tot 160 tekens');
    }
  }
  const sm = fs.readFileSync(path.join(out, 'sitemap.xml'), 'utf8');
  assert.ok(sm.includes('<loc>https://voorbeeld.nl/</loc>') && sm.includes('goedkoopste-supermarkt.html'));
  assert.ok(!sm.includes('404.html'), '404 hoort niet in de sitemap');
  assert.ok(fs.readFileSync(path.join(out, 'robots.txt'), 'utf8').includes('Sitemap: https://voorbeeld.nl/sitemap.xml'));
  /* het mandje noemt nooit een winkel zonder actuele gewone prijzen als goedkoopste */
  const g = fs.readFileSync(path.join(out, 'goedkoopste-supermarkt.html'), 'utf8');
  assert.ok(/Niet vergeleken|het goedkoopst|te weinig actuele/.test(g));
  fs.rmSync(out, {recursive: true, force: true});
});

test('een winkel- of productnaam met {{...}} of HTML stopt de build niet en wordt veilig getoond', () => {
  const zlib = require('zlib');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seo-'));
  const d = JSON.parse(zlib.gunzipSync(Buffer.from(fs.readFileSync(path.join(ROOT, 'data', 'data.b64'), 'utf8'), 'base64')));
  const s = d.stores.find(st => st.r > 0 && st.n && st.n.length);
  s.c = s.c + ' {{BOOM}} <img src=x>';
  const b64 = path.join(dir, 'data.b64');
  fs.writeFileSync(b64, zlib.gzipSync(Buffer.from(JSON.stringify(d))).toString('base64'));
  const out = path.join(dir, 'uit'); fs.mkdirSync(out);
  execFileSync(process.execPath, [path.join(ROOT, 'kit', 'seo_build.js'), b64, path.join(ROOT, 'site'), out, 'https://voorbeeld.nl/'], {stdio: 'pipe'});
  const all = fs.readdirSync(out).filter(f => f.endsWith('.html')).map(f => fs.readFileSync(path.join(out, f), 'utf8')).join('');
  assert.ok(!all.includes('<img src=x>'), 'HTML uit de data wordt geëscaped');
  assert.ok(!all.includes('{{BOOM}}'), 'accolades uit de data worden gecodeerd');
  fs.rmSync(dir, {recursive: true, force: true});
});
