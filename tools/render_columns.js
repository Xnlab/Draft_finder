// 작업실(workbench)을 헤드리스 브라우저로 열어, 칼럼마다 근거 상자까지 계산된 본문 HTML을 뽑는다.
// 공개 사이트는 이 결과만 싣는다(전체 경기 데이터를 올리지 않는다). src/build_public.py가 부른다.
//   node tools/render_columns.js http://127.0.0.1:PORT/ 결과.json
const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const [url, out] = process.argv.slice(2);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(url + '#columns');
    await page.waitForFunction('typeof window.dfExport === "function" && typeof G !== "undefined" && G.length > 0', null, { timeout: 120000 });
    const posts = await page.evaluate(() => window.dfExport());
    if (errors.length) throw new Error('작업실 화면 오류: ' + errors.join(' / '));
    fs.writeFileSync(out, JSON.stringify(posts));
  } finally {
    await browser.close();
  }
})().catch(e => { console.error(e.message || e); process.exit(1); });
