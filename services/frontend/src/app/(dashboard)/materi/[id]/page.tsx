import { notFound } from "next/navigation";
import { PageTransition, MarkdownLite } from "@/components/shared";
import { Button, Badge } from "@/components/primitives";
import { Trash2, Pencil } from "lucide-react";
import { getMateriSSR } from "@/lib/api/materi";

export const dynamic = "force-dynamic";

export default async function MateriDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const doc = await getMateriSSR(id);

  if (!doc) {
    notFound();
  }

  return (
    <PageTransition>
      <article className="prose dark:prose-invert max-w-none">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1>{doc.title}</h1>
            {doc.description && (
              <p className="text-muted-foreground">{doc.description}</p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" asChild>
              <a href={"/materi/" + doc.id + "/edit"}>
                <Pencil className="h-4 w-4" />
              </a>
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <a href={"/materi/new?duplicate=" + doc.id}>
                <Trash2 className="h-4 w-4" />
              </a>
            </Button>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <Badge tone="neutral">{doc.category}</Badge>
          {doc.tags.map((tag) => (
            <Badge key={tag} tone="neutral">
              {tag}
            </Badge>
          ))}
        </div>

        {/* MarkdownLite component renders content safely (no dangerouslySetInnerHTML) */}
        <MarkdownLite content={doc.content} />
      </article>
    </PageTransition>
  );
}
