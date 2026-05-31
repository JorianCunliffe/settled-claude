/**
 * Workflow Engine — Core Library
 *
 * Entirely data-driven: all workflow logic is read from WorkflowDefinition records.
 * Never hardcode stage names, numbers, or conditions here.
 */

import { prisma } from "@/lib/prisma";
import { withAudit } from "@/lib/audit";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WorkflowState {
  propertyWorkflowId: string;
  workflowName: string;
  workflowVersion: number;
  currentStageKey: string;
  stages: StageState[];
  financialPosition: FinancialPosition;
}

export interface StageState {
  key: string;
  name: string;
  description: string;
  ownerRole: string;
  dependsOn: string[];
  state: "locked" | "available" | "in_progress" | "awaiting" | "complete";
  gateConditions: GateCondition[];
  gatesSatisfied: boolean;
  costItems: CostItem[];
  revenueItems: RevenueItem[];
  actualCost: number;
  actualRevenue: number;
  actionText: Record<string, string>;
  startedAt: Date | null;
  completedAt: Date | null;
  expectedDurationDays: number;
}

export interface GateCondition {
  key: string;
  description: string;
  requiredParty: string;
  type: "deliverable" | "validation" | "approval";
  satisfied?: boolean;
}

export interface CostItem {
  key: string;
  label: string;
  estimateLow: number;
  estimateHigh: number;
  payer: string;
  fromFacility: boolean;
  actual?: number;
}

export interface RevenueItem {
  key: string;
  label: string;
  estimateLow: number;
  estimateHigh: number;
  recipient: string;
  actual?: number;
}

export interface FinancialPosition {
  facilityApproved: number;
  drawnToDate: number;
  remainingFacility: number;
  estimatedRemainingCosts: { low: number; high: number };
  estimatedSalePrice: { low: number; high: number };
  estimatedCommission: { low: number; high: number };
  estimatedNetProceeds: { low: number; high: number };
}

// ─── Workflow Definition shape (matches JSON files) ───────────────────────────

interface WorkflowStageDefinition {
  key: string;
  name: string;
  description: string;
  ownerRole: string;
  dependsOn: string[];
  expectedDurationDays: number;
  gateConditions: GateCondition[];
  costItems: CostItem[];
  revenueItems: RevenueItem[];
  actionText: Record<string, string>;
}

interface WorkflowDefinitionJson {
  name: string;
  propertyType: string;
  version: number;
  stages: WorkflowStageDefinition[];
}

// ─── Condition evaluation ─────────────────────────────────────────────────────

type ConditionContext = {
  property: { form6SignedAt: Date | null; status: string } | null;
  financeFacility: { status: string } | null;
  stageGate: {
    agentDelivered: boolean;
    platformValidated: boolean;
    sellerApproved: boolean;
  } | null;
};

const conditionCheckers: Record<
  string,
  (ctx: ConditionContext) => boolean
> = {
  form6_signed: (ctx) => ctx.property?.form6SignedAt !== null && ctx.property?.form6SignedAt !== undefined,
  finance_approved: (ctx) => ctx.financeFacility?.status === "approved",
  seller_onboarding_approved: (ctx) => ctx.stageGate?.sellerApproved ?? false,
  conjunction_signed: (ctx) => ctx.stageGate?.agentDelivered ?? false,
  agent_intro_completed: (ctx) => ctx.stageGate?.platformValidated ?? false,
  seller_agent_approved: (ctx) => ctx.stageGate?.sellerApproved ?? false,
  improvements_complete: (ctx) => ctx.stageGate?.agentDelivered ?? false,
  photography_complete: (ctx) => ctx.stageGate?.platformValidated ?? false,
  seller_prep_approved: (ctx) => ctx.stageGate?.sellerApproved ?? false,
  buyer_matching_run: (ctx) => ctx.stageGate?.agentDelivered ?? false,
  off_market_inspections_complete: (ctx) => ctx.stageGate?.platformValidated ?? false,
  seller_off_market_approved: (ctx) => ctx.stageGate?.sellerApproved ?? false,
  listing_published: (ctx) => ctx.stageGate?.agentDelivered ?? false,
  open_homes_scheduled: (ctx) => ctx.stageGate?.platformValidated ?? false,
  seller_ready_for_offers: (ctx) => ctx.stageGate?.sellerApproved ?? false,
  offer_accepted: (ctx) => ctx.stageGate?.agentDelivered ?? false,
  contract_signed: (ctx) => ctx.stageGate?.platformValidated ?? false,
  seller_contract_approved: (ctx) => ctx.stageGate?.sellerApproved ?? false,
  settlement_booked: (ctx) => ctx.stageGate?.agentDelivered ?? false,
  settlement_funds_confirmed: (ctx) => ctx.stageGate?.platformValidated ?? false,
  seller_settlement_approved: (ctx) => ctx.stageGate?.sellerApproved ?? false,
  // Auction-specific
  appraisal_delivered: (ctx) => ctx.stageGate?.agentDelivered ?? false,
  reserve_validated: (ctx) => ctx.stageGate?.platformValidated ?? false,
  seller_reserve_approved: (ctx) => ctx.stageGate?.sellerApproved ?? false,
  auction_listing_published: (ctx) => ctx.stageGate?.agentDelivered ?? false,
  open_homes_completed: (ctx) => ctx.stageGate?.platformValidated ?? false,
  seller_auction_ready: (ctx) => ctx.stageGate?.sellerApproved ?? false,
  auction_conducted: (ctx) => ctx.stageGate?.agentDelivered ?? false,
  result_validated: (ctx) => ctx.stageGate?.platformValidated ?? false,
  seller_result_approved: (ctx) => ctx.stageGate?.sellerApproved ?? false,
  contract_prepared: (ctx) => ctx.stageGate?.agentDelivered ?? false,
};

function evaluateCondition(conditionKey: string, ctx: ConditionContext): boolean {
  const checker = conditionCheckers[conditionKey];
  return checker ? checker(ctx) : false;
}

// ─── Engine functions ─────────────────────────────────────────────────────────

/**
 * Returns the active WorkflowDefinition for a given property type.
 * Highest version where status = 'active'.
 */
export async function getActiveWorkflowForPropertyType(
  propertyType: string
): Promise<{ id: string; name: string; version: number; definition: unknown }> {
  const definition = await prisma.workflowDefinition.findFirst({
    where: { propertyType, status: "active" },
    orderBy: { version: "desc" },
  });

  if (!definition) {
    throw new Error(`No active workflow definition found for property type: ${propertyType}`);
  }

  return definition;
}

/**
 * Initialises a PropertyWorkflow for a property.
 * Creates PropertyWorkflow + StageProgress rows for every stage.
 * First stage: 'available'. All others: 'locked'.
 */
export async function initPropertyWorkflow(
  propertyId: string,
  workflowDefinitionId: string
): Promise<string> {
  const definition = await prisma.workflowDefinition.findUniqueOrThrow({
    where: { id: workflowDefinitionId },
  });

  const def = definition.definition as unknown as WorkflowDefinitionJson;
  const stages = def.stages;

  if (stages.length === 0) {
    throw new Error("Workflow definition has no stages");
  }

  const firstStageKey = stages[0]!.key;

  const propertyWorkflow = await prisma.propertyWorkflow.create({
    data: {
      propertyId,
      workflowDefinitionId,
      currentStageKey: firstStageKey,
      stageProgress: {
        createMany: {
          data: stages.map((stage, index) => ({
            stageKey: stage.key,
            state: index === 0 ? ("available" as const) : ("locked" as const),
          })),
        },
      },
    },
  });

  await withAudit(prisma, {
    entityType: "PropertyWorkflow",
    entityId: propertyWorkflow.id,
    action: "workflow_initialised",
    metadata: { propertyId, workflowDefinitionId, firstStageKey },
  });

  return propertyWorkflow.id;
}

/**
 * Full workflow state for a property — definition + all stage progress + financial position.
 * Primary read model for all workflow UI rendering.
 */
export async function getPropertyWorkflowState(
  propertyId: string,
  _viewerRole: string
): Promise<WorkflowState> {
  const propertyWorkflow = await prisma.propertyWorkflow.findUniqueOrThrow({
    where: { propertyId },
    include: {
      workflowDefinition: true,
      stageProgress: true,
      stageGates: true,
      property: {
        include: { financeFacility: true },
      },
    },
  });

  const def = propertyWorkflow.workflowDefinition.definition as unknown as WorkflowDefinitionJson;

  const stages: StageState[] = def.stages.map((stageDef) => {
    const progress = propertyWorkflow.stageProgress.find(
      (p) => p.stageKey === stageDef.key
    );
    const gate = propertyWorkflow.stageGates.find(
      (g) => g.stageKey === stageDef.key
    );

    const ctx: ConditionContext = {
      property: propertyWorkflow.property,
      financeFacility: propertyWorkflow.property.financeFacility,
      stageGate: gate ?? null,
    };

    const gateConditions: GateCondition[] = stageDef.gateConditions.map((gc) => ({
      ...gc,
      satisfied: evaluateCondition(gc.key, ctx),
    }));

    const gatesSatisfied = gateConditions.every((gc) => gc.satisfied === true);

    return {
      key: stageDef.key,
      name: stageDef.name,
      description: stageDef.description,
      ownerRole: stageDef.ownerRole,
      dependsOn: stageDef.dependsOn,
      state: (progress?.state ?? "locked") as StageState["state"],
      gateConditions,
      gatesSatisfied,
      costItems: stageDef.costItems,
      revenueItems: stageDef.revenueItems,
      actualCost: progress?.actualCost ?? 0,
      actualRevenue: progress?.actualRevenue ?? 0,
      actionText: stageDef.actionText,
      startedAt: progress?.startedAt ?? null,
      completedAt: progress?.completedAt ?? null,
      expectedDurationDays: stageDef.expectedDurationDays,
    };
  });

  const financialPosition = await computeFinancialPosition(propertyId);

  return {
    propertyWorkflowId: propertyWorkflow.id,
    workflowName: def.name,
    workflowVersion: propertyWorkflow.workflowDefinition.version,
    currentStageKey: propertyWorkflow.currentStageKey,
    stages,
    financialPosition,
  };
}

/**
 * Evaluates whether all gate conditions for a stage are satisfied.
 */
export async function evaluateGateConditions(
  propertyWorkflowId: string,
  stageKey: string
): Promise<{ satisfied: boolean; unmet: string[] }> {
  const propertyWorkflow = await prisma.propertyWorkflow.findUniqueOrThrow({
    where: { id: propertyWorkflowId },
    include: {
      workflowDefinition: true,
      stageGates: { where: { stageKey } },
      property: { include: { financeFacility: true } },
    },
  });

  const def = propertyWorkflow.workflowDefinition.definition as unknown as WorkflowDefinitionJson;
  const stageDef = def.stages.find((s) => s.key === stageKey);

  if (!stageDef) {
    throw new Error(`Stage '${stageKey}' not found in workflow definition`);
  }

  const gate = propertyWorkflow.stageGates[0] ?? null;

  const ctx: ConditionContext = {
    property: propertyWorkflow.property,
    financeFacility: propertyWorkflow.property.financeFacility,
    stageGate: gate,
  };

  const unmet: string[] = [];

  for (const condition of stageDef.gateConditions) {
    if (!evaluateCondition(condition.key, ctx)) {
      unmet.push(condition.description);
    }
  }

  return { satisfied: unmet.length === 0, unmet };
}

/**
 * Advances a stage to 'complete' and unlocks the next stage(s).
 * Precondition: all gate conditions must be satisfied.
 */
export async function advanceStage(
  propertyWorkflowId: string,
  stageKey: string,
  actorId: string
): Promise<void> {
  const gate = await evaluateGateConditions(propertyWorkflowId, stageKey);

  if (!gate.satisfied) {
    throw new Error(`Gate conditions not met: ${gate.unmet.join("; ")}`);
  }

  const propertyWorkflow = await prisma.propertyWorkflow.findUniqueOrThrow({
    where: { id: propertyWorkflowId },
    include: {
      workflowDefinition: true,
      stageProgress: true,
    },
  });

  const def = propertyWorkflow.workflowDefinition.definition as unknown as WorkflowDefinitionJson;
  const stages = def.stages;

  const currentIndex = stages.findIndex((s) => s.key === stageKey);
  if (currentIndex === -1) {
    throw new Error(`Stage '${stageKey}' not found in workflow definition`);
  }

  // Stages that depend on the completed stage
  const stagesToUnlock = stages.filter((s) => s.dependsOn.includes(stageKey));

  await prisma.$transaction(async (tx) => {
    // Mark current stage complete
    await tx.stageProgress.update({
      where: {
        propertyWorkflowId_stageKey: { propertyWorkflowId, stageKey },
      },
      data: {
        state: "complete",
        completedAt: new Date(),
      },
    });

    // Unlock next stages (only if all their dependencies are complete)
    for (const nextStage of stagesToUnlock) {
      const allDepsDone = nextStage.dependsOn.every((depKey) => {
        const depProgress = propertyWorkflow.stageProgress.find(
          (p) => p.stageKey === depKey
        );
        return depProgress?.state === "complete" || depKey === stageKey;
      });

      if (allDepsDone) {
        await tx.stageProgress.update({
          where: {
            propertyWorkflowId_stageKey: {
              propertyWorkflowId,
              stageKey: nextStage.key,
            },
          },
          data: {
            state: "available",
            startedAt: new Date(),
          },
        });
      }
    }

    // Update PropertyWorkflow.currentStageKey to the first available incomplete stage
    const nextCurrentStage = stagesToUnlock[0]?.key ?? stageKey;
    await tx.propertyWorkflow.update({
      where: { id: propertyWorkflowId },
      data: { currentStageKey: nextCurrentStage },
    });

    // Update Property.currentStage (numeric index of current stage)
    const nextIndex = stages.findIndex((s) => s.key === nextCurrentStage);
    await tx.property.update({
      where: { id: propertyWorkflow.propertyId },
      data: { currentStage: nextIndex + 1 },
    });

    await tx.auditLog.create({
      data: {
        actorId,
        entityType: "PropertyWorkflow",
        entityId: propertyWorkflowId,
        action: "stage_advanced",
        metadata: {
          stageKey,
          unlockedStages: stagesToUnlock.map((s) => s.key),
        },
      },
    });
  });
}

/**
 * Computes financial position for a property (server-side, never client-calculated).
 */
export async function computeFinancialPosition(
  propertyId: string
): Promise<FinancialPosition> {
  const [facility, propertyWorkflow] = await Promise.all([
    prisma.financeFacility.findUnique({
      where: { propertyId },
      include: { drawdowns: true },
    }),
    prisma.propertyWorkflow.findUnique({
      where: { propertyId },
      include: {
        workflowDefinition: true,
        stageProgress: true,
      },
    }),
  ]);

  const facilityApproved = facility?.approvedAmount ?? 0;
  const drawnToDate = facility?.drawdowns
    .filter((d) => d.status === "processed")
    .reduce((sum, d) => sum + d.amount, 0) ?? 0;
  const remainingFacility = Math.max(0, facilityApproved - drawnToDate);

  let estimatedRemainingCostsLow = 0;
  let estimatedRemainingCostsHigh = 0;
  let estimatedSaleLow = 0;
  let estimatedSaleHigh = 0;
  let estimatedCommissionLow = 0;
  let estimatedCommissionHigh = 0;

  if (propertyWorkflow) {
    const def = propertyWorkflow.workflowDefinition.definition as unknown as WorkflowDefinitionJson;

    for (const stage of def.stages) {
      const progress = propertyWorkflow.stageProgress.find(
        (p) => p.stageKey === stage.key
      );
      const isComplete = progress?.state === "complete";

      if (!isComplete) {
        for (const cost of stage.costItems) {
          estimatedRemainingCostsLow += cost.estimateLow;
          estimatedRemainingCostsHigh += cost.estimateHigh;
        }
      }

      for (const revenue of stage.revenueItems) {
        if (revenue.recipient === "seller") {
          estimatedSaleLow = Math.max(estimatedSaleLow, revenue.estimateLow);
          estimatedSaleHigh = Math.max(estimatedSaleHigh, revenue.estimateHigh);
        }
        if (revenue.recipient === "platform") {
          estimatedCommissionLow += revenue.estimateLow;
          estimatedCommissionHigh += revenue.estimateHigh;
        }
      }
    }
  }

  const estimatedNetLow = Math.max(
    0,
    estimatedSaleLow - estimatedRemainingCostsHigh - estimatedCommissionHigh - drawnToDate
  );
  const estimatedNetHigh = Math.max(
    0,
    estimatedSaleHigh - estimatedRemainingCostsLow - estimatedCommissionLow - drawnToDate
  );

  return {
    facilityApproved,
    drawnToDate,
    remainingFacility,
    estimatedRemainingCosts: {
      low: estimatedRemainingCostsLow,
      high: estimatedRemainingCostsHigh,
    },
    estimatedSalePrice: { low: estimatedSaleLow, high: estimatedSaleHigh },
    estimatedCommission: { low: estimatedCommissionLow, high: estimatedCommissionHigh },
    estimatedNetProceeds: { low: estimatedNetLow, high: estimatedNetHigh },
  };
}

/**
 * Cumulative actual cost across all completed + in-progress stages.
 */
export async function getCumulativeCost(propertyWorkflowId: string): Promise<number> {
  const result = await prisma.stageProgress.aggregate({
    where: {
      propertyWorkflowId,
      state: { in: ["in_progress", "awaiting", "complete"] },
    },
    _sum: { actualCost: true },
  });

  return result._sum.actualCost ?? 0;
}
