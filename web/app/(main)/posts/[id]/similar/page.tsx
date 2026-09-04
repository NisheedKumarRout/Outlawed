import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { SectionShell } from "@/components/layout/SectionShell";
import { SimilarCasesList } from "@/components/posts/SimilarCasesList";
import { getPostById } from "@/lib/data/posts";

export const metadata: Metadata = { title: "Similar cases" };

type PageProps = { params: Promise<{ id: string }> };

export default async function SimilarCasesPage({ params }: PageProps) {
  const { id } = await params;
  const post = await getPostById(id);
  if (!post) notFound();

  return (
    <SectionShell
      eyebrow="Knowledge discovery"
      title={`Precedents like "${post.title}"`}
      description="Seeded with this insight's problem statement. Edit it to match your own situation more closely."
    >
      <SimilarCasesList
        excludePostId={post.id}
        initialQuery={`${post.problem}\n\n${post.context}`.slice(0, 1200)}
        heading="Related precedents"
      />
    </SectionShell>
  );
}
