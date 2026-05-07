import WorldSphere from "@/components/WorldSphere";

export const dynamic = "force-dynamic";

export default function MidvaleFriendsPage() {
  // Full-bleed: breaks out of the root layout's responsive padding at every
  // breakpoint — same technique as /midvale/[userId].
  return (
    <div style={{ width: "100vw", marginLeft: "calc(50% - 50vw)" }}>
      <WorldSphere
        friendsWorld
        backHref="/midvale"
        userName="Friends"
      />
    </div>
  );
}
