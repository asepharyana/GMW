import { PageTransition } from "@/components/shared";
import { Badge, Button, GlassCard, Input } from "@/components/primitives";
import { Plus, BookOpen, MessageSquare, Search } from "lucide-react";
import { listMateriSSR } from "@/lib/api/materi";
import type { MateriDocument } from "@/lib/types/materi";
import Link from "next/link";

export const dynamic = "force-dynamic";

async function loadMateri(search?: string): Promise<MateriDocument[]> {
  try {
    return await listMateriSSR(50, search);
  } catch {
    return [];
  }
}

function MateriGrid({ materi }: { materi: MateriDocument[] }) {
  if (materi.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <BookOpen className="mx-auto h-12 w-12 mb-4 opacity-50" />
        <p>Belum ada materi. Jadilah yang pertama membuat materi!</p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {materi.map((doc) => (
        <Link key={doc.id} href={"/materi/" + doc.id}>
          <GlassCard className="h-full cursor-pointer hover:shadow-lg transition-shadow">
            <div className="p-6">
              <h3 className="font-bold text-lg mb-2 line-clamp-2">{doc.title}</h3>
              {doc.description && (
                <p className="text-sm text-muted-foreground mb-3 line-clamp-3">
                  {doc.description}
                </p>
              )}
              <div className="flex flex-wrap gap-1 mb-3">
                <Badge tone="neutral" className="text-xs">
                  {doc.category}
                </Badge>
                {doc.tags.slice(0, 3).map((tag) => (
                  <Badge key={tag} tone="neutral" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{doc.view_count} views</span>
                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
              </div>
            </div>
          </GlassCard>
        </Link>
      ))}
    </div>
  );
}

export default async function MateriPage({
  searchParams,
}: {
  searchParams: Promise<{ search?: string }>;
}) {
  const params = await searchParams;
  const materi = await loadMateri(params.search);

  return (
    <PageTransition>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold">Materi &amp; Bahan Belajar</h1>
            <p className="text-muted-foreground mt-1">
              Dokumen, panduan, dan bahan belajar komunitas beserta AI agent RAG
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/materi/chat">
              <Button variant="outline" size="sm">
                <MessageSquare className="h-4 w-4 mr-2" />
                AI Chat
              </Button>
            </Link>
            <Button size="sm" asChild>
              <Link href={"/materi/new"}>
                <Plus className="h-4 w-4 mr-2" />
                Buat Materi
              </Link>
            </Button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Cari materi..."
            className="pl-10"
            name="search"
            defaultValue={params.search}
          />
        </div>

        <MateriGrid materi={materi} />
      </div>
    </PageTransition>
  );
}
