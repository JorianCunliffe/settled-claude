/**
 * DocuSign integration — JWT Grant, token caching, envelope operations.
 * See /docs/api-docusign.md for the full API contract.
 */

// Token cache (in-memory — refreshed every 50 min)
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt) {
    return cachedToken.token;
  }

  // Stub: in Sprint 2, replace with real JWT Grant flow
  // POST https://account.docusign.com/oauth/token
  // grant_type: urn:ietf:params:oauth:grant-type:jwt-bearer
  // assertion: signed JWT using RSA private key
  const token = `stub_token_${Date.now()}`;
  cachedToken = { token, expiresAt: Date.now() + 50 * 60 * 1000 };
  return token;
}

export interface EnvelopeResult {
  envelopeId: string;
  status: string;
}

export async function sendForm6Envelope(params: {
  sellerName: string;
  sellerEmail: string;
  propertyAddress: string;
  commissionRate: string;
  exclusiveTerm: string;
  lotPlan: string | null;
  datePrepared: string;
}): Promise<EnvelopeResult> {
  // Stub: returns a mock envelopeId for Sprint 1
  // Sprint 2 (S2-004): replace with real DocuSign CreateEnvelope call
  console.log("[DocuSign] sendForm6Envelope stub called", params);
  return {
    envelopeId: `stub-form6-${Date.now()}`,
    status: "sent",
  };
}

export async function sendConjunctionEnvelope(params: {
  agentName: string;
  agentEmail: string;
  propertyAddress: string;
}): Promise<EnvelopeResult> {
  console.log("[DocuSign] sendConjunctionEnvelope stub called", params);
  return {
    envelopeId: `stub-conjunction-${Date.now()}`,
    status: "sent",
  };
}

export async function sendContractEnvelope(params: {
  sellerName: string;
  sellerEmail: string;
  buyerName: string;
  buyerEmail: string;
  contractPdfBase64: string;
}): Promise<EnvelopeResult> {
  console.log("[DocuSign] sendContractEnvelope stub called", params);
  return {
    envelopeId: `stub-contract-${Date.now()}`,
    status: "sent",
  };
}

export async function getEnvelopeStatus(envelopeId: string): Promise<{
  status: string;
  completedAt: string | null;
}> {
  console.log("[DocuSign] getEnvelopeStatus stub called", envelopeId);
  return { status: "sent", completedAt: null };
}

export async function downloadSignedDocument(
  envelopeId: string,
  documentId: string
): Promise<Buffer> {
  console.log("[DocuSign] downloadSignedDocument stub called", envelopeId, documentId);
  return Buffer.from("stub-pdf-content");
}

export async function voidEnvelope(
  envelopeId: string,
  reason: string
): Promise<void> {
  console.log("[DocuSign] voidEnvelope stub called", envelopeId, reason);
}

export function verifyWebhookHmac(
  rawBody: string,
  signature: string
): boolean {
  // Sprint 2: implement HMAC-SHA256 verification using DOCUSIGN_CONNECT_HMAC_KEY
  const hmacKey = process.env.DOCUSIGN_CONNECT_HMAC_KEY;
  if (!hmacKey) return false;

  const crypto = require("crypto") as typeof import("crypto");
  const expected = crypto
    .createHmac("sha256", hmacKey)
    .update(rawBody)
    .digest("base64");

  return expected === signature;
}
