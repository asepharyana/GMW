const puppeteer = require("puppeteer-core");
(async () => {
  const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox","--disable-setuid-sandbox"] });
  const page = await browser.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push("PAGEERR: " + e.message));
  page.on("console", (m) => { if (m.type() === "error" || m.type()==="warning") errs.push("CONS["+m.type()+"]: " + m.text().slice(0,100)); });
  await page.goto("http://127.0.0.1:4019/voice/", { waitUntil: "domcontentloaded", timeout: 30000 });
  await new Promise((r) => setTimeout(r, 4000));
  const snap = await page.evaluate(() => ({
    url: location.href,
    hasVoice: !!Array.from(document.querySelectorAll("*")).find(e => e.textContent && e.textContent.includes("Live speakers")),
    hasPicker: !!Array.from(document.querySelectorAll("select"))[0] || false,
  }));
  console.log("DIRECT /voice/ load:", JSON.stringify(snap));
  console.log("ERRORS:", errs.slice(0,15).join("\n") || "none");
  await browser.close();
})().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });