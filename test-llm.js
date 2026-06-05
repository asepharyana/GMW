const baseURL = process.env.AI_LLM_BASE_URL;
const apiKey = process.env.AI_LLM_API_KEY;

async function main() {
  console.log("🚀 Initializing test script...");
  console.log("baseURL:", baseURL);
  console.log("apiKey:", apiKey ? "Set (Hidden)" : "Not Set");

  const model = "cf/@cf/google/gemma-4-26b-a4b-it";
  const startMs = Date.now();

  try {
    console.log(`\n📡 Mengirim request ke model: ${model} ...`);
    
    // Kita gunakan timeout manual menggunakan AbortController untuk mensimulasikan
    // timeout LLM klien di batas waktu tinggi
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000); // 120 detik

    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "Jelaskan secara singkat cara kerja timeout API." }
        ]
      }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    const endMs = Date.now();
    console.log(`\n✅ Respons diterima dalam ${endMs - startMs}ms`);
    console.log("Status HTTP:", response.status);
    
    const text = await response.text();
    try {
      const data = JSON.parse(text);
      console.dir(data, { depth: null });
      console.log("\n📝 Content:");
      console.log(data.choices?.[0]?.message?.content);
    } catch {
      console.log("\n📝 Raw Text Response:");
      console.log(text);
    }

  } catch (error) {
    const endMs = Date.now();
    console.log(`\n❌ Request gagal setelah ${endMs - startMs}ms`);
    console.error("Pesan Error:", error.message);
  }
}

main().catch(console.error);
