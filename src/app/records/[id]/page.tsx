import { IdentifierReferenceContent } from "../../../components/actions/IdentifierReferenceContent";
import { getIdentifierReferences } from "../../../lib/actions/identifier-references";

export default async function RecordPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const references = await getIdentifierReferences("record", id);
  return <IdentifierReferenceContent kind="record" id={id} references={references} />;
}
