import GauriStatusClient from "./GauriStatusClient";

// Public status-check page — the link farmers save after submitting a
// case. No login. Server wrapper just unwraps the async params (Next.js 15)
// and hands a plain id string to the client component that does the actual
// fetching/rendering -- same behavior as askshree-app (v1)'s
// app/gauri/status/[id]/page.js.
export default async function GauriStatusPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GauriStatusClient id={id} />;
}
