import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getActiveWorkflowForPropertyType, initPropertyWorkflow } from "@/lib/workflow-engine";
import { createClient } from "@/lib/supabase/server";
import { ok, err } from "@/types";

const CreatePropertySchema = z.object({
  addressLine: z.string().min(3),
  suburb: z.string().min(2),
  state: z.string().default("QLD"),
  postcode: z.string().regex(/^\d{4}$/),
  propertyType: z.enum(["residential", "residential_auction"]).default("residential"),
  bedrooms: z.number().int().positive().optional(),
  bathrooms: z.number().int().positive().optional(),
  carSpaces: z.number().int().nonnegative().optional(),
  landSqm: z.number().positive().optional(),
  lotPlan: z.string().optional(),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(err("Unauthorised"), { status: 401 });
    }

    const body: unknown = await request.json();
    const parsed = CreatePropertySchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        err(parsed.error.issues.map((i) => i.message).join("; ")),
        { status: 400 }
      );
    }

    const data = parsed.data;

    // Ensure User record exists (synced from Supabase auth)
    const dbUser = await prisma.user.upsert({
      where: { id: user.id },
      update: {},
      create: {
        id: user.id,
        email: user.email!,
        fullName: (user.user_metadata["full_name"] as string | undefined) ?? user.email!,
        userType: "seller",
      },
    });

    // Find active workflow definition for this property type
    const workflowDef = await getActiveWorkflowForPropertyType(data.propertyType);

    // Create property + initialise workflow in a transaction
    const property = await prisma.$transaction(async (tx) => {
      const created = await tx.property.create({
        data: {
          sellerId: dbUser.id,
          addressLine: data.addressLine,
          suburb: data.suburb,
          state: data.state,
          postcode: data.postcode,
          propertyType: data.propertyType,
          bedrooms: data.bedrooms,
          bathrooms: data.bathrooms,
          carSpaces: data.carSpaces,
          landSqm: data.landSqm,
          lotPlan: data.lotPlan,
        },
      });

      await tx.auditLog.create({
        data: {
          actorId: dbUser.id,
          entityType: "Property",
          entityId: created.id,
          action: "property_created",
          metadata: { propertyType: data.propertyType, suburb: data.suburb },
        },
      });

      return created;
    });

    const propertyWorkflowId = await initPropertyWorkflow(property.id, workflowDef.id);

    return NextResponse.json(
      ok({ propertyId: property.id, propertyWorkflowId }),
      { status: 201 }
    );
  } catch (error) {
    console.error("[POST /api/properties]", error);
    return NextResponse.json(err("Internal server error"), { status: 500 });
  }
}

export async function GET(_request: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(err("Unauthorised"), { status: 401 });
    }

    const properties = await prisma.property.findMany({
      where: { sellerId: user.id },
      include: { propertyWorkflow: true },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(ok(properties));
  } catch (error) {
    console.error("[GET /api/properties]", error);
    return NextResponse.json(err("Internal server error"), { status: 500 });
  }
}
