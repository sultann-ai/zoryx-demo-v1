import { InventoryItemList } from "./inventory/InventoryItemList";
import { InventoryLinksSection } from "./inventory/InventoryLinksSection";
import { PageHeader } from "../components/ui";

export function InventoryPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Inventory" />
      <InventoryItemList />
      <InventoryLinksSection />
    </div>
  );
}
