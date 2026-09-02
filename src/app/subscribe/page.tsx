import SubscriptionFlow from "@/components/subscription-flow";

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[] }>;
}) {
  const params = await searchParams;
  return <SubscriptionFlow selectedPlanId={typeof params.plan === "string" ? params.plan : ""} />;
}
