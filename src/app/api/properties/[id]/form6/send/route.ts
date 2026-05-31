import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";
import { sendForm6Envelope } from "@/lib/docusign";
import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/types";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(err("Unauthorised"), { status: 401 });
    }

    const property = await prisma.property.findUnique({
      where: { id: params.id },
      include: { seller: true },
    });

    if (!property) {
      return NextResponse.json(err("Property not found"), { status: 404 });
    }

    if (property.sellerId !== user.id) {
      return NextResponse.json(err("Forbidden"), { status: 403 });
    }

    if (property.status !== "draft") {
      return NextResponse.json(
        err(`Cannot send Form 6 — property status is '${property.status}'`),
        { status: 422 }
      );
    }

    const fullAddress = `${property.addressLine}, ${property.suburb} ${property.state} ${property.postcode}`;

    const result = await sendForm6Envelope({
      sellerName: property.seller.fullName,
      sellerEmail: property.seller.email,
      propertyAddress: fullAddress,
      commissionRate: "2.5% inc GST",
      exclusiveTerm: `${property.form6RollingTermMonths} months, rolling`,
      lotPlan: property.lotPlan,
      datePrepared: new Date().toISOString(),
    });

    await prisma.property.update({
      where: { id: property.id },
      data: {
        form6DocusignEnvelopeId: result.envelopeId,
        status: "form6_pending",
      },
    });

    await withAudit(prisma, {
      actorId: user.id,
      entityType: "Property",
      entityId: property.id,
      action: "form6_sent",
      metadata: { envelopeId: result.envelopeId, sellerEmail: property.seller.email },
    });

    return NextResponse.json(ok({ envelopeId: result.envelopeId }));
  } catch (error) {
    console.error("[POST /api/properties/[id]/form6/send]", error);
    return NextResponse.json(err("Internal server error"), { status: 500 });
  }
}
