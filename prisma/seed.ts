import { PrismaClient } from "@prisma/client";
import * as fs from "fs";
import * as path from "path";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database…");

  // ─── Workflow definitions ────────────────────────────────────────────────────
  const workflowsDir = path.join(process.cwd(), "workflows");

  const standardDef = JSON.parse(
    fs.readFileSync(path.join(workflowsDir, "standard_residential.json"), "utf-8")
  ) as { name: string; propertyType: string; version: number; stages: unknown };

  const auctionDef = JSON.parse(
    fs.readFileSync(path.join(workflowsDir, "auction_campaign.json"), "utf-8")
  ) as { name: string; propertyType: string; version: number; stages: unknown };

  const standardWorkflow = await prisma.workflowDefinition.upsert({
    where: {
      propertyType_version: {
        propertyType: standardDef.propertyType,
        version: standardDef.version,
      },
    },
    update: {
      name: standardDef.name,
      status: "active",
      definition: standardDef as object,
      publishedAt: new Date(),
    },
    create: {
      name: standardDef.name,
      propertyType: standardDef.propertyType,
      version: standardDef.version,
      status: "active",
      definition: standardDef as object,
      publishedAt: new Date(),
    },
  });

  const auctionWorkflow = await prisma.workflowDefinition.upsert({
    where: {
      propertyType_version: {
        propertyType: auctionDef.propertyType,
        version: auctionDef.version,
      },
    },
    update: {
      name: auctionDef.name,
      status: "active",
      definition: auctionDef as object,
      publishedAt: new Date(),
    },
    create: {
      name: auctionDef.name,
      propertyType: auctionDef.propertyType,
      version: auctionDef.version,
      status: "active",
      definition: auctionDef as object,
      publishedAt: new Date(),
    },
  });

  console.log(`  ✓ WorkflowDefinition: ${standardWorkflow.name} (v${standardWorkflow.version})`);
  console.log(`  ✓ WorkflowDefinition: ${auctionWorkflow.name} (v${auctionWorkflow.version})`);

  // ─── Test organisation ───────────────────────────────────────────────────────
  const testOrg = await prisma.organisation.upsert({
    where: { slug: "test-union" },
    update: {},
    create: {
      name: "Test Union",
      slug: "test-union",
      contactEmail: "admin@test-union.example.com",
      commissionStructure: { type: "flat", amount: 500, currency: "AUD" },
      aggregationFloor: 5,
    },
  });

  console.log(`  ✓ Organisation: ${testOrg.name} (/${testOrg.slug})`);

  // ─── Test agency ─────────────────────────────────────────────────────────────
  const testAgency = await prisma.agency.upsert({
    where: { id: "00000000-0000-0000-0000-000000000001" },
    update: {},
    create: {
      id: "00000000-0000-0000-0000-000000000001",
      name: "Settled Test Agency",
      licenceNo: "TEST-LIC-001",
    },
  });

  // ─── Test agents ──────────────────────────────────────────────────────────────
  const agentSeeds = [
    {
      id: "00000000-0000-0000-0001-000000000001",
      userId: "00000000-0001-0000-0001-000000000001",
      email: "agent1@settled.test",
      name: "Sarah Chen",
      suburbs: ["Paddington", "New Farm", "Fortitude Valley"],
      scorecardScore: 94,
    },
    {
      id: "00000000-0000-0000-0001-000000000002",
      userId: "00000000-0001-0000-0001-000000000002",
      email: "agent2@settled.test",
      name: "Marcus Webb",
      suburbs: ["Clayfield", "Ascot", "Hamilton"],
      scorecardScore: 88,
    },
    {
      id: "00000000-0000-0000-0001-000000000003",
      userId: "00000000-0001-0000-0001-000000000003",
      email: "agent3@settled.test",
      name: "Priya Nair",
      suburbs: ["West End", "South Brisbane", "Highgate Hill"],
      scorecardScore: 91,
    },
  ];

  for (const seed of agentSeeds) {
    const user = await prisma.user.upsert({
      where: { id: seed.userId },
      update: {},
      create: {
        id: seed.userId,
        email: seed.email,
        fullName: seed.name,
        userType: "agent",
      },
    });

    const agent = await prisma.agent.upsert({
      where: { userId: user.id },
      update: { scorecardScore: seed.scorecardScore },
      create: {
        id: seed.id,
        userId: user.id,
        agencyId: testAgency.id,
        suburbs: seed.suburbs,
        specialisations: ["residential"],
        scorecardScore: seed.scorecardScore,
        appraisalAccuracy: 97 + Math.random() * 3,
        sellerNpsAvg: 4.2 + Math.random() * 0.8,
        conversionRate: 0.72 + Math.random() * 0.2,
        offMarketRate: 0.18 + Math.random() * 0.15,
      },
    });

    console.log(`  ✓ Agent: ${seed.name} (score: ${agent.scorecardScore})`);
  }

  console.log("✅ Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
