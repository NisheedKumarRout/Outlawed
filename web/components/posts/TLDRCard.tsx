export function TLDRCard({
  tldr,
  keyTakeaway,
}: {
  tldr: string | null;
  keyTakeaway: string;
}) {
  return (
    <section className="tldr-card">
      <span>{tldr ? "TL;DR" : "Key takeaway"}</span>
      <p>{tldr ?? keyTakeaway}</p>
    </section>
  );
}
