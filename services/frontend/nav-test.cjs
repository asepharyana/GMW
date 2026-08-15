const puppeteer = require("puppeteer-core");

(async () => {
  const browser = await puppeteer.launch({
    executablePath: "/usr/bin/google-chrome",
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERROR: " + e.message));
  await page.goto("http://localhost:3000/dashboard/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));

  const info = await page.evaluate(() => {
    const v = Array.from(document.querySelectorAll('a[aria-label]')).find((a) => a.getAttribute("aria-label") === "Voice");
    const r = v.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });
  await page.mouse.click(info.cx, info.cy);
  for (const t of [500, 1000, 2000, 3500]) {
    await new Promise((r) => setTimeout(r, t === 500 ? 500 : t - (t === 1000 ? 500 : t === 2000 ? 1000 : 2000)));
    console.log(`url @${t}ms:`, page.url());
  }
  console.log("ERRORS:", errs.slice(0, 10).join(" | ") || "none");
  await browser.close();
})().catch((e) => { console.error("SCRIPT FAIL:", e); process.exit(1); });
