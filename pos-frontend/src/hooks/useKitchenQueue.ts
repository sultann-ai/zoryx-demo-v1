import { useQuery } from "@tanstack/react-query";
import { kitchenQueueApi } from "../api/kitchenQueue";

export function useKitchenQueue(kitchenId: string | null) {
  return useQuery({
    queryKey: ["kitchen-queue", kitchenId],
    queryFn: () => kitchenQueueApi.get(kitchenId as string),
    enabled: kitchenId !== null,
  });
}
