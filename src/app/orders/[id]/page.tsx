import { getIdentifierReferences, IdentifierReferenceContent } from "../../identifier-reference-page";

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const references = await getIdentifierReferences("order", id);
  return <IdentifierReferenceContent kind="order" id={id} references={references} />;
}
