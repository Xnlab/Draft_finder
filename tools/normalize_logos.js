// 팀 로고 SVG를 정사각형 가운데 정렬로 맞춘다: 실제 그림 영역(getBBox)을 재서 viewBox를 다시 잡는다.
//   node tools/normalize_logos.js workbench/logos/original workbench/logos
// 원본(original/)은 그대로 두고, 결과를 workbench/logos/에 쓴다. 여백은 한 변의 6%.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [src, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const f of fs.readdirSync(src).filter(x => x.endsWith('.svg'))) {
    const svg = fs.readFileSync(path.join(src, f), 'utf8');
    await page.setContent(`<!doctype html><body style="margin:0">${svg}</body>`);
    const box = await page.evaluate(() => { const b = document.querySelector('svg').getBBox(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
    if (!box.w || !box.h) throw new Error(f + ': 그림 영역을 잴 수 없음');
    const side = Math.max(box.w, box.h) * 1.12, cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const vb = [cx - side / 2, cy - side / 2, side, side].map(v => +v.toFixed(3)).join(' ');
    const fixed = svg.replace(/<svg\b[^>]*>/, tag => {
      let t = tag.replace(/\s(width|height|viewBox|preserveAspectRatio)="[^"]*"/g, '');
      return t.replace(/<svg/, `<svg viewBox="${vb}" preserveAspectRatio="xMidYMid meet"`);
    });
    fs.writeFileSync(path.join(out, f), fixed);
    console.log(f, '그림', Math.round(box.w), 'x', Math.round(box.h), '-> viewBox', vb);
  }
  await browser.close();
})().catch(e => { console.error(e.message); process.exit(1); });
