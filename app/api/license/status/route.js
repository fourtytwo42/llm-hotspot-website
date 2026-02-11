import { NextResponse } from "next/server";

import { getLicenseStatus } from "@/lib/store";

export async function POST(request) {
  try {
    const { licenseKey, deviceId } = await request.json();
    if (!licenseKey || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "licenseKey and deviceId are required" },
        { status: 400 },
      );
    }

    const result = await getLicenseStatus({ licenseKey, deviceId });
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      license: result.license,
      message: result.license.isExpired
        ? "License is expired and unpaid"
        : "License is active",
    });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Status check failed" },
      { status: 500 },
    );
  }
}
