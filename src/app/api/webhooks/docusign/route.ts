import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { prisma } from "@/lib/prisma";
import { verifyWebhookHmac } from "@/lib/docusign";
import { advanceStage } from "@/lib/workflow-engine";

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get("x-docusign-signature-1") ?? "";

    // HMAC verification
    if (!verifyWebhookHmac(rawBody, signature)) {
      console.warn("[DocuSign webhook] HMAC verification failed");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    // Idempotency check
    const payloadHash = createHash("sha256").update(rawBody).digest("hex");
    const existing = await prisma.webhookLog.findUnique({
      where: { source_payloadHash: { source: "docusign", payloadHash } },
    });

    if (existing?.processed) {
      return NextResponse.json({ ok: true, duplicate: true });
    }

    // Record webhook (mark unprocessed initially)
    await prisma.webhookLog.upsert({
      where: { source_payloadHash: { source: "docusign", payloadHash } },
      create: { source: "docusign", payloadHash },
      update: {},
    });

    const payload = JSON.parse(rawBody) as Record<string, unknown>;
    const event = payload["event"] as string | undefined;
    const envelopeId = payload["envelopeId"] as string | undefined;

    // Return 200 immediately; process asynchronously
    // Sprint 2 (S2-005): replace with Inngest background job
    setImmediate(async () => {
      try {
        await processDocuSignEvent({ event, envelopeId, payload, payloadHash });
      } catch (e) {
        console.error("[DocuSign webhook] async processing error", e);
      }
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[DocuSign webhook]", error);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}

async function processDocuSignEvent({
  event,
  envelopeId,
  payloadHash,
}: {
  event: string | undefined;
  envelopeId: string | undefined;
  payload: Record<string, unknown>;
  payloadHash: string;
}) {
  if (!envelopeId || !event) return;

  // Route by envelope type (look up in DB)
  const property = await prisma.property.findFirst({
    where: { form6DocusignEnvelopeId: envelopeId },
    include: { propertyWorkflow: true },
  });

  if (property) {
    if (event === "envelope-completed") {
      await prisma.property.update({
        where: { id: property.id },
        data: { form6SignedAt: new Date(), status: "form6_signed" },
      });

      // Attempt to advance onboarding stage if other conditions also met
      if (property.propertyWorkflow) {
        try {
          await advanceStage(property.propertyWorkflow.id, "onboarding", "system");
        } catch {
          // Gate conditions not yet fully met — that's expected
        }
      }
    } else if (event === "envelope-declined" || event === "envelope-voided") {
      await prisma.property.update({
        where: { id: property.id },
        data: { status: "form6_declined" },
      });
    }
  }

  await prisma.webhookLog.update({
    where: { source_payloadHash: { source: "docusign", payloadHash } },
    data: { processed: true, processedAt: new Date(), eventType: event, entityId: envelopeId },
  });
}
