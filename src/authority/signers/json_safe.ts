/** JSON.stringify helper so BigInt and nested structures survive wire transfer to a sidecar. */
export function stringifyEip712Payload(value: unknown): string {
  return JSON.stringify(value, (_, v) => (typeof v === "bigint" ? v.toString() : v));
}
