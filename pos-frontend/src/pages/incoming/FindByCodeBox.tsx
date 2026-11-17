import { useState } from "react";
import type { FormEvent } from "react";
import type { Kitchen } from "../../api/kitchens";
import type { OrderDetail } from "../../api/orders";
import { Button, Card } from "../../components/ui";
import { useIncomingOrdersByCode } from "../../hooks/useOrders";
import { normalizeOrderCode } from "../../lib/orderCode";
import { IncomingOrderCard } from "./IncomingOrderCard";

interface FindByCodeBoxProps {
  kitchens: Kitchen[];
  onGone: (orderId: string) => void;
  onPrintFailure: (order: OrderDetail, message: string) => void;
}

// A customer rings up and reads out the code from their order page ("K7P2M"): type it here and the order
// comes straight up, with the same Accept / Reject buttons as in the list below.
export function FindByCodeBox({ kitchens, onGone, onPrintFailure }: FindByCodeBoxProps) {
  const [text, setText] = useState("");
  const [searched, setSearched] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);
  const { data, isLoading, isError } = useIncomingOrdersByCode(searched);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = normalizeOrderCode(text);
    if (code === null) {
      setInputError("A code is 5 letters and numbers, like K7P2M. It never has the letters O, I or L, or the numbers 0 or 1.");
      return;
    }
    setInputError(null);
    setSearched(code);
  }

  function handleClear() {
    setText("");
    setSearched(null);
    setInputError(null);
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-1.5">
        <label htmlFor="find-by-code" className="text-meta font-medium text-ink-muted">
          Find by code
        </label>
        <div className="flex flex-wrap gap-2">
          {/* One joined control: the input and Find share a single border, radius and focus
              ring (focus-within), and the button's own rounding is flattened where it meets
              the input. */}
          <div
            className={
              "flex h-11 min-w-0 flex-1 overflow-hidden rounded-card border border-border bg-surface-raised sm:max-w-xs sm:flex-none " +
              "hover:border-ink-muted focus-within:border-accent focus-within:ring-2 focus-within:ring-accent " +
              "[&>button]:h-full [&>button]:rounded-none [&>button]:border-0"
            }
          >
            <input
              id="find-by-code"
              value={text}
              onChange={(event) => setText(event.target.value.toUpperCase())}
              placeholder="K7P2M"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={8}
              aria-invalid={inputError !== null}
              className="h-full min-w-0 flex-1 border-0 bg-transparent px-3 text-body font-semibold tracking-[0.15em] text-ink placeholder:font-normal placeholder:text-ink-muted focus:outline-none"
            />
            <Button type="submit" variant="primary">
              Find
            </Button>
          </div>
          {searched !== null && (
            <Button type="button" variant="secondary" onClick={handleClear}>
              Clear
            </Button>
          )}
        </div>
        {inputError && (
          <p role="alert" className="text-meta text-status-danger-text">
            {inputError}
          </p>
        )}
      </form>

      {searched !== null && (
        <Card title={`Order code ${searched}`}>
          {isLoading && <p className="text-body text-ink-muted">Looking…</p>}
          {isError && <p className="text-body text-status-danger-text">Could not look that code up. Please try again.</p>}
          {data && data.orders.length === 0 && (
            <p className="text-body text-ink-muted">
              No order with that code is waiting. It may already have been accepted or rejected, so check the Orders list.
            </p>
          )}
          {data && data.orders.length > 0 && (
            <div className="flex flex-col gap-3">
              {data.orders.map((order) => (
                <IncomingOrderCard key={order.id} order={order} kitchens={kitchens} onGone={onGone} onPrintFailure={onPrintFailure} />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
