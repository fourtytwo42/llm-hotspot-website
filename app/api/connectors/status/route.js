import { NextResponse } from "next/server";

import { getConnectorStatusBySlug } from "@/lib/store";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = String(searchParams.get("slug") || "").trim().toLowerCase();
    if (!slug) {
      return NextResponse.json({ ok: false, error: "slug is required" }, { status: 400 });
    }

    const result = await getConnectorStatusBySlug(slug);
    if (!result.ok) {
      return NextResponse.json(result, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error.message || "Connector status failed" },
      { status: 500 },
    );
  }
}

