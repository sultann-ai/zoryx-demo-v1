import { useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { PrintStyles } from "../components/PrintStyles";
import { useKitchens } from "../hooks/useKitchens";
import { useOrder } from "../hooks/useOrders";
import type { SlipItem } from "../print/kitchenSlip";
import { buildKitchenSlips, decodeAdded } from "../print/kitchenSlip";

function SlipItemRow({ item }: { item: SlipItem }) {
  return (
    <li>
      {item.addedMark && <strong className="added">[{item.addedMark}] </strong>}
      {item.title}
      {item.dealTag && ` ${item.dealTag}`}
      {item.addOns && <div className="sub">{item.addOns}</div>}
      {item.notes.map((note) => (
        <div key={note} className="sub note">
          NOTE: {note}
        </div>
      ))}
    </li>
  );
}

// Browser-print fallback for the kitchen slips — the same KitchenSlip model the print agent's
// docs are built from (print/kitchenSlip.ts), so both paths print the same layout: one slip
// per kitchen, each listing every item, its own kitchen named in the header and its group
// bold and large, the rest smaller under "Other kitchens". "?added=id:qty,…" marks items
// that were just added, exactly like the direct print it stands in for.
export function PrintKitchenTicketsPage() {
  const { id } = useParams<{ id: string }>();
  const orderId = id ?? "";
  const [searchParams] = useSearchParams();
  const { data: order, isLoading, isError } = useOrder(orderId);
  const { data: kitchens, isLoading: isLoadingKitchens } = useKitchens();
  const hasPrintedRef = useRef(false);

  useEffect(() => {
    // Waits for kitchens too, so the slip names are right on the copy that actually prints.
    // Nothing prints while a scheduled order is on hold — not even from this fallback page.
    if (order && !isLoadingKitchens && order.status !== "SCHEDULED" && !hasPrintedRef.current) {
      hasPrintedRef.current = true;
      window.print();
    }
  }, [order, isLoadingKitchens]);

  if (isLoading) {
    return <p>Loading kitchen tickets…</p>;
  }
  if (isError || !order) {
    return <p>Order not found.</p>;
  }
  if (order.status === "SCHEDULED") {
    return <p>This order is scheduled and on hold — nothing prints until it's released.</p>;
  }

  const slips = buildKitchenSlips(order, kitchens ?? [], { added: decodeAdded(searchParams.get("added")) });

  return (
    <div>
      <PrintStyles />
      <style>{`
        .this-kitchen { font-size: 17px; font-weight: bold; text-align: center; border-top: 3px double #000; border-bottom: 3px double #000; padding: 4px 0; margin: 0 0 6px; word-break: break-word; }
        .slip-head { font-size: 14px; font-weight: bold; }
        .slip-flag { font-size: 14px; font-weight: bold; }
        .slip ul { list-style: none; padding: 0; margin: 2px 0 6px; }
        .slip li { word-break: break-word; }
        .sub { padding-left: 2em; }
        .own-label { font-size: 15px; font-weight: bold; border-top: 3px double #000; padding-top: 4px; margin-top: 4px; }
        .own li { font-size: 15px; font-weight: bold; line-height: 1.3; }
        .others-label { font-weight: bold; border-top: 1px dashed #000; padding-top: 4px; margin-top: 4px; }
        .others .group-label { font-weight: bold; margin-top: 2px; }
        .others li { font-size: 11px; padding-left: 1em; }
      `}</style>
      {slips.map((slip) => (
        <div className="ticket slip" key={slip.kitchenId}>
          <p className="this-kitchen">THIS KITCHEN: {slip.kitchenName.toUpperCase()}</p>
          <p className="slip-head">Order #{slip.orderNumber}</p>
          <p className="slip-head">{slip.placeLine}</p>
          <p>{slip.typeLine}</p>
          <p>{slip.timeLine}</p>
          {slip.scheduledLine && <p className="slip-flag">{slip.scheduledLine}</p>}
          {slip.customerLines.map((line, index) => (
            <p key={index}>{line}</p>
          ))}
          {slip.packLine && <p className="slip-flag">{slip.packLine}</p>}
          {slip.addedLine && <p className="slip-flag">{slip.addedLine}</p>}

          <div className="own">
            <p className="own-label">{slip.own.kitchenName} (this kitchen)</p>
            <ul>
              {slip.own.items.map((item) => (
                <SlipItemRow key={item.id} item={item} />
              ))}
            </ul>
          </div>

          {slip.others.length > 0 && (
            <div className="others">
              <p className="others-label">Other kitchens</p>
              {slip.others.map((group) => (
                <div key={group.kitchenId}>
                  <p className="group-label">{group.kitchenName}:</p>
                  <ul>
                    {group.items.map((item) => (
                      <SlipItemRow key={item.id} item={item} />
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
      <button type="button" className="no-print" onClick={() => window.print()}>
        Print
      </button>
    </div>
  );
}
