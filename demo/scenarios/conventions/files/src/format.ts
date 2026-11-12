export function formatPrice(cents: any, currency: any = "EUR") {
  console.log("formatting price", cents);
  return (cents / 100).toFixed(2) + " " + currency;
}
