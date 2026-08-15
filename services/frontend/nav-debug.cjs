const puppeteer = require("puppeteer-core");
(async () => {
  const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox","--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  page.on("pageerror", (e) => console.log("PAGEERROR:", e.message));
  await page.goto("http://127.0.0.1:4017/dashboard/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));

  // Find every <a> tag and log its href + event listeners
  const anchors = await page.$$eval("a", els => els.map(a => ({
    href: a.getAttribute("href"),
    hasClick: a.hasAttribute("onClick"),
    outer: a.outerHTML.substring(0, 200)
  })));
  console.log("ALL ANCHORS:", JSON.stringify(anchors));

  // Inject error catches
  await page.evaluate(() => {
    window.__clicks = [];
    window.__events = [];
    document.addEventListener("click", (e) => window.__clicks.push({ target: e.target.tagName, dp: e.defaultPrevented, url: location.href }), true);
    document.addEventListener("click", (e) => {
      const t = e.target.closest("a");
      if (t) {
        window.__events.push({ targetTag: t.tagName, href: t.getAttribute("href"), dp: e.defaultPrevented });
      }
    }, false);
  });

  // Click the Voice nav anchor
  await page.evaluate(() => {
    const v = Array.from(document.querySelectorAll('a[aria-label]')).find(a=>a.getAttribute('aria-label')==='Voice');
    if (v) v.click();
  });
  await new Promise((r) => setTimeout(r, 3000));

  console.log("URL after click:", page.url());
  console.log("history.length:", await page.evaluate(() => history.length));
  console.log("CLICKS (capture phase):", JSON.stringify(await page.evaluate(() => window.__clicks)));
  console.log("CLICKS (bubble phase):", JSON.stringify(await page.evaluate(() => window.__clicks)));

  // Force navigate and confirm destination
  await page.evaluate(() => { window.location.href = "/voice/"; });
  await new Promise((r) => setTimeout(r, 2000));
  console.log("FORCED to /voice/ ->", page.url());

  await browser.close();
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });