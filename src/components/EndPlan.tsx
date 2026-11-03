import { cancelSubscription } from "@/app/actions/patron";
import ConfirmAction from "@/components/ConfirmAction";

type Props = {
  subscription: { id: string; expiresAt: Date | null; cancelAtPeriodEnd: boolean; gifted: boolean };
  paid: boolean;
  returnTo: string;
};

// Shows "ends on" for plans already winding down, otherwise a confirmed end-plan button.
export default function EndPlan({ subscription, paid, returnTo }: Props) {
  if (subscription.cancelAtPeriodEnd && subscription.expiresAt) {
    return <span className="text-sm text-muted">Ends on {subscription.expiresAt.toISOString().slice(0, 10)}</span>;
  }
  return (
    <ConfirmAction
      action={cancelSubscription}
      fields={{ subscriptionId: subscription.id, returnTo }}
      label={paid ? "End plan" : "Unfollow"}
      message={paid ? "End your plan? You keep access until the period you paid for is over." : "Stop following?"}
      confirmLabel={paid ? "Yes, end plan" : "Yes, unfollow"}
    />
  );
}
