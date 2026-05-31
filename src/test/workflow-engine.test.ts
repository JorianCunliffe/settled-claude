import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  getActiveWorkflowForPropertyType,
  initPropertyWorkflow,
  evaluateGateConditions,
  advanceStage,
  getCumulativeCost,
} from "@/lib/workflow-engine";

const standardWorkflowDef = {
  name: "Standard Residential Sale",
  propertyType: "residential",
  version: 1,
  stages: [
    {
      key: "onboarding",
      name: "Onboarding",
      description: "Complete onboarding",
      ownerRole: "seller",
      dependsOn: [],
      expectedDurationDays: 3,
      gateConditions: [
        { key: "form6_signed", description: "Form 6 signed", requiredParty: "platform", type: "deliverable" },
        { key: "finance_approved", description: "Finance approved", requiredParty: "platform", type: "validation" },
        { key: "seller_onboarding_approved", description: "Seller approves", requiredParty: "seller", type: "approval" },
      ],
      costItems: [],
      revenueItems: [],
      actionText: { seller: "Sign Form 6", default: "Onboarding" },
    },
    {
      key: "agent_selection",
      name: "Agent Assignment",
      description: "Assign agent",
      ownerRole: "platform_admin",
      dependsOn: ["onboarding"],
      expectedDurationDays: 2,
      gateConditions: [
        { key: "conjunction_signed", description: "Conjunction signed", requiredParty: "agent", type: "deliverable" },
        { key: "agent_intro_completed", description: "Intro complete", requiredParty: "platform_admin", type: "validation" },
        { key: "seller_agent_approved", description: "Seller approves agent", requiredParty: "seller", type: "approval" },
      ],
      costItems: [],
      revenueItems: [],
      actionText: { seller: "Review agent", default: "Agent assignment" },
    },
  ],
};

const mockWorkflowDbRecord = {
  id: "wf-def-001",
  name: standardWorkflowDef.name,
  propertyType: "residential",
  version: 1,
  status: "active",
  definition: standardWorkflowDef,
  publishedAt: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe("getActiveWorkflowForPropertyType", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns the active workflow definition", async () => {
    vi.mocked(prisma.workflowDefinition.findFirst).mockResolvedValue(mockWorkflowDbRecord);
    const result = await getActiveWorkflowForPropertyType("residential");
    expect(result.id).toBe("wf-def-001");
    expect(result.name).toBe("Standard Residential Sale");
  });

  it("throws when no active definition exists", async () => {
    vi.mocked(prisma.workflowDefinition.findFirst).mockResolvedValue(null);
    await expect(getActiveWorkflowForPropertyType("residential")).rejects.toThrow(
      "No active workflow definition found"
    );
  });
});

describe("initPropertyWorkflow", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates PropertyWorkflow and StageProgress rows", async () => {
    vi.mocked(prisma.workflowDefinition.findUniqueOrThrow).mockResolvedValue(mockWorkflowDbRecord);
    vi.mocked(prisma.propertyWorkflow.create).mockResolvedValue({
      id: "pw-001",
      propertyId: "prop-001",
      workflowDefinitionId: "wf-def-001",
      currentStageKey: "onboarding",
      startedAt: new Date(),
      completedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(prisma.auditLog.create).mockResolvedValue({} as never);

    const id = await initPropertyWorkflow("prop-001", "wf-def-001");
    expect(id).toBe("pw-001");

    const createCall = vi.mocked(prisma.propertyWorkflow.create).mock.calls[0];
    expect(createCall).toBeDefined();
    const createData = createCall![0]!.data;
    expect(createData.currentStageKey).toBe("onboarding");
    const stageProgressData = createData.stageProgress?.createMany?.data;
    expect(stageProgressData).toHaveLength(2);
    const stageArray = Array.isArray(stageProgressData) ? stageProgressData : [];
    expect((stageArray[0] as { state: string } | undefined)?.state).toBe("available");
    expect((stageArray[1] as { state: string } | undefined)?.state).toBe("locked");
  });
});

describe("evaluateGateConditions", () => {
  beforeEach(() => vi.clearAllMocks());

  const makeWorkflow = (overrides: {
    form6SignedAt?: Date;
    facilityStatus?: string;
    agentDelivered?: boolean;
    platformValidated?: boolean;
    sellerApproved?: boolean;
  } = {}) => ({
    id: "pw-001",
    propertyId: "prop-001",
    workflowDefinitionId: "wf-def-001",
    currentStageKey: "onboarding",
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    workflowDefinition: mockWorkflowDbRecord,
    stageGates: overrides.agentDelivered !== undefined ? [{
      id: "sg-001",
      propertyWorkflowId: "pw-001",
      stageKey: "onboarding",
      agentDelivered: overrides.agentDelivered ?? false,
      platformValidated: overrides.platformValidated ?? false,
      sellerApproved: overrides.sellerApproved ?? false,
      agentDeliveredAt: null,
      platformValidatedAt: null,
      sellerApprovedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    }] : [],
    property: {
      id: "prop-001",
      form6SignedAt: overrides.form6SignedAt ?? null,
      status: "draft",
      financeFacility: overrides.facilityStatus ? { status: overrides.facilityStatus } : null,
    },
  });

  it("returns satisfied=false when all conditions unmet", async () => {
    vi.mocked(prisma.propertyWorkflow.findUniqueOrThrow).mockResolvedValue(makeWorkflow() as never);
    const result = await evaluateGateConditions("pw-001", "onboarding");
    expect(result.satisfied).toBe(false);
    expect(result.unmet).toHaveLength(3);
  });

  it("returns satisfied=false when only form6 is signed", async () => {
    vi.mocked(prisma.propertyWorkflow.findUniqueOrThrow).mockResolvedValue(
      makeWorkflow({ form6SignedAt: new Date() }) as never
    );
    const result = await evaluateGateConditions("pw-001", "onboarding");
    expect(result.satisfied).toBe(false);
    expect(result.unmet).toHaveLength(2);
  });

  it("returns satisfied=true when all conditions met", async () => {
    vi.mocked(prisma.propertyWorkflow.findUniqueOrThrow).mockResolvedValue(
      makeWorkflow({
        form6SignedAt: new Date(),
        facilityStatus: "approved",
        agentDelivered: false,
        platformValidated: false,
        sellerApproved: true,
      }) as never
    );
    const result = await evaluateGateConditions("pw-001", "onboarding");
    expect(result.satisfied).toBe(true);
    expect(result.unmet).toHaveLength(0);
  });

  it("throws when stage key not found", async () => {
    vi.mocked(prisma.propertyWorkflow.findUniqueOrThrow).mockResolvedValue(makeWorkflow() as never);
    await expect(
      evaluateGateConditions("pw-001", "nonexistent_stage")
    ).rejects.toThrow("not found in workflow definition");
  });
});

describe("advanceStage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("throws when gate conditions not satisfied", async () => {
    vi.mocked(prisma.propertyWorkflow.findUniqueOrThrow).mockResolvedValue({
      id: "pw-001",
      workflowDefinition: mockWorkflowDbRecord,
      stageGates: [],
      stageProgress: [],
      property: { id: "prop-001", form6SignedAt: null, status: "draft", financeFacility: null },
    } as never);

    await expect(advanceStage("pw-001", "onboarding", "actor-001")).rejects.toThrow(
      "Gate conditions not met"
    );
  });
});

describe("getCumulativeCost", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns sum of actual costs", async () => {
    vi.mocked(prisma.stageProgress.aggregate).mockResolvedValue({
      _sum: { actualCost: 4250 },
    } as never);
    const cost = await getCumulativeCost("pw-001");
    expect(cost).toBe(4250);
  });

  it("returns 0 when no costs recorded", async () => {
    vi.mocked(prisma.stageProgress.aggregate).mockResolvedValue({
      _sum: { actualCost: null },
    } as never);
    const cost = await getCumulativeCost("pw-001");
    expect(cost).toBe(0);
  });
});
