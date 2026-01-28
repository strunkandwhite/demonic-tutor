import { NextResponse } from "next/server";
import { getDraftWithCardData } from "@/core/db/queries";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await getDraftWithCardData(id);

  if (!data.draft) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(data);
}
