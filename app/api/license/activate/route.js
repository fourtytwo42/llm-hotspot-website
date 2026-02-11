import { NextResponse } from "next/server";

import { activateLicense } from "@/lib/store";

export async function POST(request) {
  try {
    const { licenseKey, deviceId } = await request.json();
    if (!licenseKey || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "licenseKey and deviceId are required" },
        { status: 400 },
      );
    }

    const result = await activateLicense({ licenseKey, deviceId });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Activation failed" },
      { status: 500 },
    );
  }
}
