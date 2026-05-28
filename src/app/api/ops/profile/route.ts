import { NextResponse } from "next/server";
import { getOptionalOpsUser } from "@/lib/ops/auth";
import { fetchOpsOrganizationProfile } from "@/lib/ops/organization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getOptionalOpsUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Authentication required.",
      },
      { status: 401 },
    );
  }

  try {
    const profile = await fetchOpsOrganizationProfile();
    return NextResponse.json({ profile });
  } catch (error) {
    console.error("[ops] profile endpoint failed", error);

    return NextResponse.json(
      { error: "Could not load Pymble organization profile." },
      { status: 500 },
    );
  }
}
