import { NextResponse } from "next/server";

import { findLicenseByOrder, findOrderByRef } from "@/lib/store";

export async function GET(_request, { params }) {
  const { orderRef } = await params;
  const order = await findOrderByRef(orderRef);

  if (!order) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  const license = await findLicenseByOrder(orderRef);

  return NextResponse.json({
    ok: true,
    order: {
      orderRef: order.orderRef,
      provider: order.provider,
      status: order.status,
      planId: order.planId,
      recurring: order.recurring,
    },
    license: license
      ? {
          key: license.licenseKey,
          tier: license.tier,
          expiresAt: license.expiresAt,
        }
      : null,
  });
}
