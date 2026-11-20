import type { DiningArea } from "../../api/diningAreas";
import type { Employee } from "../../api/employees";
import type { OrderType, PaymentMethod } from "../../api/orders";
import type { FloorTable } from "../../api/tables";
import { Card, Input } from "../../components/ui";
import { ChipSelectRow } from "./ChipSelectRow";
import { DiningAreaPicker } from "./DiningAreaPicker";
import { SegmentedControl } from "./SegmentedControl";

const ORDER_TYPE_OPTIONS: { value: OrderType; label: string }[] = [
  { value: "DINE_IN", label: "Dine In" },
  { value: "TAKEAWAY", label: "Takeaway" },
  { value: "DELIVERY", label: "Delivery" },
];

const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: "CASH", label: "Cash" },
  { value: "ONLINE", label: "Online" },
];

interface OrderMetaBarProps {
  type: OrderType;
  onTypeChange: (type: OrderType) => void;
  diningAreaId: string;
  onDiningAreaChange: (id: string) => void;
  diningAreas: DiningArea[];
  deliveryAddress: string;
  onDeliveryAddressChange: (value: string) => void;
  waiterId: string;
  onWaiterChange: (id: string) => void;
  riderId: string;
  onRiderChange: (id: string) => void;
  employees: Employee[];
  paymentMethod: PaymentMethod;
  onPaymentMethodChange: (method: PaymentMethod) => void;
  // The live floor map by table id: what each table's tile shows (free / open / unavailable).
  floorById?: Map<string, FloorTable>;
}

// Everything needed to place the order besides the items themselves, without
// ever leaving this screen — and without a dropdown anywhere: every control
// here is tapped, like the menu tiles below it.
export function OrderMetaBar({
  type,
  onTypeChange,
  diningAreaId,
  onDiningAreaChange,
  diningAreas,
  deliveryAddress,
  onDeliveryAddressChange,
  waiterId,
  onWaiterChange,
  riderId,
  onRiderChange,
  employees,
  paymentMethod,
  onPaymentMethodChange,
  floorById,
}: OrderMetaBarProps) {
  const activeDiningAreas = diningAreas.filter((area) => area.isActive);
  const activeEmployees = employees.filter((employee) => employee.isActive);

  return (
    <Card className="shadow-sm">
      {/* One card, sections divided by hairlines; each section is a labelled group with its
          own label above its controls, so nothing relies on a browser fieldset. */}
      <div className="flex flex-col gap-4 [&>*+*]:border-t [&>*+*]:border-border [&>*+*]:pt-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SegmentedControl
            name="order-type"
            legend="Order type"
            options={ORDER_TYPE_OPTIONS}
            value={type}
            onChange={onTypeChange}
            fullWidth
          />
          <SegmentedControl
            name="payment-method"
            legend="Payment"
            options={PAYMENT_METHOD_OPTIONS}
            value={paymentMethod}
            onChange={onPaymentMethodChange}
            fullWidth
          />
        </div>

        {type === "DINE_IN" && (
          <div className="flex flex-col gap-2">
            <span className="text-meta font-medium text-ink-muted">Table</span>
            <DiningAreaPicker
              diningAreas={activeDiningAreas}
              selectedId={diningAreaId}
              onSelect={onDiningAreaChange}
              {...(floorById ? { floorById } : {})}
            />
          </div>
        )}

        {type === "DELIVERY" && (
          <div className="flex w-full max-w-md flex-col gap-1.5">
            <label htmlFor="new-order-delivery-address" className="text-meta font-medium text-ink-muted">
              Delivery address
            </label>
            <Input
              id="new-order-delivery-address"
              type="text"
              value={deliveryAddress}
              onChange={(event) => onDeliveryAddressChange(event.target.value)}
              required
            />
          </div>
        )}

        <ChipSelectRow label="Waiter" options={activeEmployees} value={waiterId} onChange={onWaiterChange} />

        {/* Only a delivery has someone to ride it out. */}
        {type === "DELIVERY" && (
          <ChipSelectRow label="Rider" options={activeEmployees} value={riderId} onChange={onRiderChange} />
        )}
      </div>
    </Card>
  );
}
