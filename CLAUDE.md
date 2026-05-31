# Three-Sided Property Platform — CLAUDE.md

> This is the primary context document. Read this entire file before writing any code.
> Detailed specs are in `/docs`. Workflow definitions are in `/workflows`. Prototypes are in `/prototypes`.

---

## What This Is

A licensed property sales platform that connects **sellers**, **buyers**, and **professional organisations** (unions and trade bodies) through a shared infrastructure layer. It is not a traditional real estate agency — the platform holds the principal licence, operates as the infrastructure, and sources agents as a platform resource.

**The strategic loop:**
1. Organisations give members free buyer access → builds a large engaged buyer database
2. Buyer database is the magnet for sellers → off-market matching before public campaigns
3. Sellers generate revenue → commission, finance, insurance, services
4. Revenue share flows back to organisations as referral fees → reinforces promotion

---

## The Three Sides + Infrastructure

```
┌─────────────────┬─────────────────┬──────────────────────┐
│    SELLERS      │     BUYERS      │   ORGANISATIONS      │
│  List & sell    │  Find & buy     │  Provide members,    │
│  property       │  (free/members) │  earn referral rev   │
└─────────────────┴─────────────────┴──────────────────────┘
         ────────────────────────────────────────────
                  PLATFORM INFRASTRUCTURE
         Principal licence · Workflow engine · Agents
         Finance & insurance · Integrations · Compliance
         ────────────────────────────────────────────
```

**Agents** are a platform resource — matched to sellers by the platform, operating under the platform's principal licence via Form 6 conjunction. They are not a marketplace side.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 14 (App Router) + TypeScript | Full-stack, SSR, API routes |
| Database | PostgreSQL via Supabase | Schema + realtime + auth + storage |
| ORM | Prisma | Type-safe, migration-based |
| Auth | Supabase Auth | Multi-role, row-level security |
| Realtime | Supabase Realtime | Stage gate updates, notifications |
| Storage | Supabase Storage | Documents, photos |
| Email | Resend | Transactional email |
| SMS | Twilio | Stage notifications, OTP |
| Queue | Inngest | Background jobs, webhooks |
| Testing | Vitest + Playwright | Unit + E2E |
| Deployment | Vercel (app) + Supabase (db) | Standard Next.js stack |

**Do not deviate from this stack without discussion.**

---

## Architecture Decisions

### 1. Workflow-as-Data (Critical)
The sale lifecycle is NOT hardcoded in application logic. It is a data-driven engine. Workflow definitions live in the database (`WorkflowDefinition` table) as structured JSON. The application renders whatever definition it is given.

- Adding or changing a workflow = database change, not a code deployment
- Two workflow definitions are pre-seeded: Standard Residential Sale (7 stages) and Auction Campaign (8 stages)
- See `/workflows/` for the JSON definitions
- See `schema.prisma` for the engine tables: `WorkflowDefinition`, `PropertyWorkflow`, `StageProgress`

### 2. Versioning & In-Flight Pinning
When a property starts, it is pinned to the current workflow version. Subsequent edits create a new version. **Properties already in progress never move to a new version.** This is enforced at the application layer.

### 3. No Mid-Flow Switching
A property cannot switch workflow definitions once started. If a different workflow is required, the property must be withdrawn and re-listed.

### 4. Platform-Only Workflow Configuration
Only `platform_admin` role users can create, edit, publish, or archive workflow definitions.

### 5. Every Step Has Metadata
Each `StageProgress` record carries: state (locked/available/in_progress/awaiting/complete), owner_role, actual_cost (accumulates as work is done), actual_revenue, started_at, completed_at.

### 6. Persistent Financial Tracker
The financial position (facility drawn, remaining estimates, projected net proceeds) is computed server-side and returned with each property load. It is not a client-side calculation.

### 7. Organisation Data is Always Anonymised
Organisations NEVER see individual member data. All organisation-facing queries are aggregate only. Enforce this with Supabase Row Level Security (RLS) policies.

---

## User Roles

| Role | Supabase Auth metadata | Access |
|---|---|---|
| `seller` | user_type: seller | Their own properties, full workflow |
| `buyer` | user_type: buyer | Listings, matches, own profile |
| `agent` | user_type: agent | Assigned properties, workload view |
| `org_admin` | user_type: org_admin | Anonymised org dashboard only |
| `platform_admin` | user_type: platform_admin | Everything, workflow builder |
| `system` | service role | Background jobs, webhooks |

RLS policies must enforce that:
- Sellers only see their own property records
- Agents only see properties they are conjuncted to
- Org admins only see aggregated, anonymised data for their organisation
- Platform admins see everything

---

## Key Business Rules

1. **Form 6 must be signed before Stage 2** — enforce at the stage gate, not just the UI
2. **Finance facility must be approved before drawdowns** — check `FinanceFacility.status = 'approved'`
3. **Agent conjunction is exclusive** — only one active conjunction per property at a time
4. **First-deal agents get 100% commission share** — check `Agent.first_deal_used = false` on conjunction creation
5. **Drawdowns cannot exceed facility approved amount** — validate `drawn_amount + new_amount <= approved_amount`
6. **Stage gates require all three conditions**: `agent_delivered AND platform_validated AND seller_approved` — all three must be true for the gate to open
7. **Org dashboards use minimum aggregation floor** — suppress counts below `Organisation.aggregation_floor` (default: 5)
8. **No mid-flow workflow switching** — enforced at API layer
9. **Webhook deduplication** — use `WebhookLog` table with `source + payloadHash` as dedupe key

---

## External Integrations

### DocuSign (Priority 1 — Launch Blocker)
Used for: Form 6 (seller + platform countersign), Conjunction Agreement (agent), Sale Contract (seller + buyer).

- Auth: JWT Grant (server-to-server, no user interaction)
- Australian data residency: `https://au.docusign.net/restapi`
- Three pre-configured templates: `FORM6_TEMPLATE_ID`, `CONJUNCTION_TEMPLATE_ID`, `CONTRACT_TEMPLATE_ID`
- Webhook receiver at `POST /api/webhooks/docusign` — HMAC verified
- Idempotent: check `WebhookLog` before processing
- See `/docs/api-docusign.md` for full contract (7 endpoints)

### ListReady (Priority 1 — Launch Blocker)
Pre-sale finance facility provider. Sellers apply, draw down against facility for improvements/photography/marketing. Repaid at settlement.

API contract TBD — design in Sprint 2. For now stub with mock responses.

### Domain API + REA API (Priority 1 — Launch Blocker)
Property listing syndication. Used at Stage 7 (on-market). API contracts TBD — design in Sprint 3.

---

## Project Structure

```
/
├── CLAUDE.md                    ← you are here
├── ROADMAP.md                   ← phased build plan
├── prisma/
│   ├── schema.prisma            ← database schema (27 models)
│   └── seed.ts                  ← seeds workflow definitions + test data
├── workflows/
│   ├── standard_residential.json  ← 7-stage standard sale
│   └── auction_campaign.json      ← 8-stage auction
├── docs/
│   ├── PRD.md
│   └── api-docusign.md
└── src/
    ├── middleware.ts             ← role-based route protection
    ├── app/
    │   ├── (auth)/              ← sign-in, sign-up, verify
    │   ├── (seller)/sell/       ← seller dashboard + onboarding
    │   ├── (agent)/agent/       ← agent portal (Sprint 2)
    │   ├── (buyer)/buy/         ← buyer portal (Sprint 3)
    │   ├── (org)/[orgSlug]/     ← co-branded org portal
    │   ├── (admin)/admin/       ← platform admin (Sprint 6)
    │   └── api/
    │       ├── properties/      ← POST (create), GET (list)
    │       │   └── [id]/form6/send/  ← send Form 6
    │       └── webhooks/docusign/    ← DocuSign Connect receiver
    ├── lib/
    │   ├── prisma.ts            ← Prisma singleton
    │   ├── supabase/            ← client + server clients
    │   ├── workflow-engine.ts   ← core engine (data-driven)
    │   ├── audit.ts             ← withAudit() wrapper
    │   ├── docusign.ts          ← DocuSign integration (stub in Sprint 1)
    │   └── utils.ts             ← cn(), formatCurrency()
    ├── types/index.ts           ← ApiResponse, UserType, ok(), err()
    └── test/
        ├── setup.ts             ← vitest mocks
        └── workflow-engine.test.ts  ← unit tests for S1-004
```

---

## Environment Variables Required

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Database (Prisma)
DATABASE_URL=
DIRECT_URL=

# DocuSign
DOCUSIGN_INTEGRATION_KEY=
DOCUSIGN_USER_ID=
DOCUSIGN_ACCOUNT_ID=
DOCUSIGN_PRIVATE_KEY=
DOCUSIGN_BASE_URL=https://au.docusign.net/restapi
DOCUSIGN_AUTH_URL=https://account.docusign.com
DOCUSIGN_FORM6_TEMPLATE_ID=
DOCUSIGN_CONJUNCTION_TEMPLATE_ID=
DOCUSIGN_CONTRACT_TEMPLATE_ID=
DOCUSIGN_CONNECT_HMAC_KEY=

# Platform identity
PLATFORM_PRINCIPAL_NAME=
PLATFORM_EMAIL=
PLATFORM_LICENCE_NUMBER=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=

# Resend
RESEND_API_KEY=

# Inngest
INNGEST_EVENT_KEY=
INNGEST_SIGNING_KEY=

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Code Standards

- **TypeScript strict mode** — no `any`, no implicit returns on async functions
- **All DB mutations via Prisma** — no raw SQL except for reporting queries
- **All DB mutations create an AuditLog entry** — use a `withAudit()` wrapper
- **Zod for all input validation** — validate at the API layer, not just the UI
- **No business logic in React components** — components call API routes; business logic lives in `/lib/`
- **Workflow engine is data-driven** — never hardcode stage names or numbers in application logic
- **Error handling** — all API routes return `{ data, error }` — never throw unhandled errors to the client
- **RLS everywhere** — every Supabase query from the client must go through RLS; service-role queries only in API routes

---

## What Claude Code Should NOT Do

- Do not hardcode workflow stages in application logic
- Do not let org_admin users query individual member records
- Do not process commission payments directly — stub with a `PaymentService` interface
- Do not store DocuSign private key in code — read from environment variable
- Do not create any endpoint that exposes member PII to organisation users
- Do not run migrations on production without explicit instruction
