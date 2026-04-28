import WorldSphere from "@/components/WorldSphere";

interface Props {
  params: Promise<{ userId: string }>;
}

export default async function MidvaleUserPage({ params }: Props) {
  const { userId } = await params;
  return <WorldSphere userId={userId} backHref="/midvale" />;
}
