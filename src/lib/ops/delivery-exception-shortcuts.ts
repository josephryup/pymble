export function deliveryExceptionCreateHrefForGrn(grnId: string) {
  const params = new URLSearchParams({
    create: "exception",
    grn_id: grnId,
  });

  return `/ops/delivery-exceptions?${params.toString()}#delivery-exception-create-panel`;
}
