const number = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })

/** API money arrives as a string ("1450.00"). Always Western digits: "Rs 1,450". */
export function formatRs(amount: string | number): string {
  const value = typeof amount === 'string' ? Number.parseFloat(amount) : amount
  return `Rs ${number.format(Number.isFinite(value) ? value : 0)}`
}
