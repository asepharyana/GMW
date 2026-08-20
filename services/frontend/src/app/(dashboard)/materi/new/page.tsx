"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PageTransition } from "@/components/shared";
import { Button, Input, Textarea, GlassCard } from "@/components/primitives";
import { Save, ArrowLeft } from "lucide-react";
import { createMateri } from "@/lib/api/materi";
import type { CreateMateriInput } from "@/lib/types/materi";

export const dynamic = "force-dynamic";

export default function MateriNewPage() {
  const router = useRouter();
  const [form, setForm] = useState<CreateMateriInput>({
    title: "",
    description: "",
    content: "",
    category: "general",
    tags: [],
    isPublic: true,
  });
  const [tagsInput, setTagsInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof CreateMateriInput>(key: K, value: CreateMateriInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.content.trim()) {
      setError("Judul dan konten wajib diisi.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
      const doc = await createMateri({ ...form, tags });
      router.push("/materi/" + doc.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal menyimpan materi.");
      setSaving(false);
    }
  }

  return (
    <PageTransition>
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-3xl font-bold">Buat Materi Baru</h1>
        </div>

        {error && (
          <GlassCard className="p-4 border border-red-500/30 text-red-400 text-sm">
            {error}
          </GlassCard>
        )}

        <GlassCard className="p-6 space-y-4">
          <div>
            <label className="text-sm font-medium mb-1 block">Judul *</label>
            <Input
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="Judul materi"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Deskripsi</label>
            <Input
              value={form.description ?? ""}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Deskripsi singkat"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Kategori</label>
            <Input
              value={form.category}
              onChange={(e) => update("category", e.target.value)}
              placeholder="general"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Tags (pisahkan dengan koma)</label>
            <Input
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="wibu, discord, moderation"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Konten *</label>
            <Textarea
              value={form.content}
              onChange={(e) => update("content", e.target.value)}
              placeholder="Tulis materi di sini..."
              rows={12}
            />
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.isPublic}
              onChange={(e) => update("isPublic", e.target.checked)}
            />
            Publik (terlihat semua orang)
          </label>

          <div className="flex justify-end">
            <Button onClick={handleSubmit} disabled={saving}>
              <Save className="h-4 w-4 mr-2" />
              {saving ? "Menyimpan..." : "Simpan"}
            </Button>
          </div>
        </GlassCard>
      </div>
    </PageTransition>
  );
}
