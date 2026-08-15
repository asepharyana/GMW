const puppeteer = require("puppeteer-core");
(async () => {
  const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox","--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  const net = [];
  page.on("request", (r) => { const u = r.url(); if (u.includes("_rsc") || u.includes("/voice")) net.push("REQ " + r.method() + " " + u); });
  page.on("response", (r) => { const u = r.url(); if (u.includes("_rsc") || u.includes("/voice")) net.push("RES " + r.status() + " " + u); });
  page.on("pageerror", (e) => console.log("PAGEERR:", e.message));
  await page.goto("http://127.0.0.1:4019/dashboard/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 2500));

  const info = await page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Voice"]');
    const a = document.querySelector('a[aria-label="Voice"]');
    return { buttonPresent: !!b, aPresent: !!a };
  });
  console.log("NAV button present:", info.buttonPresent, "| a present:", info.aPresent);

  await page.evaluate(() => {
    const b = document.querySelector('button[aria-label="Voice"]');
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 3000));
  console.log("URL after click:", page.url(), "| history:", await page.evaluate(() => history.length));
  await browser.close();
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });