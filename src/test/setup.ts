// Global test setup — runs before every test file
// Mock prisma to avoid requiring a live DB in unit tests
import { vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    workflowDefinition: {
      findFirst: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    propertyWorkflow: {
      create: vi.fn(),
      findUniqueOrThrow: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    stageProgress: {
      update: vi.fn(),
      aggregate: vi.fn(),
    },
    financeFacility: {
      findUnique: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
    webhookLog: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
      update: vi.fn(),
    },
    property: {
      update: vi.fn(),
    },
    $transaction: vi.fn((fn: (tx: unknown) => Promise<unknown>) => fn({
      stageProgress: { update: vi.fn() },
      propertyWorkflow: { update: vi.fn() },
      property: { update: vi.fn() },
      auditLog: { create: vi.fn() },
    })),
  },
}));
