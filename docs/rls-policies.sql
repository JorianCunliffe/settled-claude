-- Row Level Security Policies (S1-003)
-- Applied via Supabase migration. Column names are camelCase (no @map on Prisma fields).

-- Helper: get user_type from Supabase JWT
CREATE OR REPLACE FUNCTION auth_user_type()
RETURNS text
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(
    current_setting('request.jwt.claims', true)::jsonb -> 'user_metadata' ->> 'user_type',
    ''
  );
$$;

-- Helper: get authenticated user ID
CREATE OR REPLACE FUNCTION auth_uid()
RETURNS uuid
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);
$$;

-- Enable RLS on all critical tables
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE conjunctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- ─── properties ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "sellers_own_properties" ON properties;
CREATE POLICY "sellers_own_properties" ON properties
  FOR ALL
  USING (
    auth_user_type() = 'seller'
    AND "sellerId" = auth_uid()::text
  );

DROP POLICY IF EXISTS "agents_conjuncted_properties" ON properties;
CREATE POLICY "agents_conjuncted_properties" ON properties
  FOR SELECT
  USING (
    auth_user_type() = 'agent'
    AND EXISTS (
      SELECT 1 FROM conjunctions
      WHERE conjunctions."propertyId" = properties.id
        AND conjunctions."agentId" IN (
          SELECT id FROM agents WHERE "userId" = auth_uid()::text
        )
        AND conjunctions.status = 'active'
    )
  );

DROP POLICY IF EXISTS "platform_admin_all_properties" ON properties;
CREATE POLICY "platform_admin_all_properties" ON properties
  FOR ALL
  USING (auth_user_type() = 'platform_admin');

-- ─── property_workflows ──────────────────────────────────────────────────────

DROP POLICY IF EXISTS "property_workflows_via_property" ON property_workflows;
CREATE POLICY "property_workflows_via_property" ON property_workflows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_workflows."propertyId"
    )
  );

DROP POLICY IF EXISTS "platform_admin_property_workflows" ON property_workflows;
CREATE POLICY "platform_admin_property_workflows" ON property_workflows
  FOR ALL
  USING (auth_user_type() = 'platform_admin');

-- ─── stage_progress ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "stage_progress_read" ON stage_progress;
CREATE POLICY "stage_progress_read" ON stage_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM property_workflows pw
      JOIN properties p ON p.id = pw."propertyId"
      WHERE pw.id = stage_progress."propertyWorkflowId"
        AND (
          p."sellerId" = auth_uid()::text
          OR auth_user_type() = 'platform_admin'
          OR (
            auth_user_type() = 'agent'
            AND EXISTS (
              SELECT 1 FROM conjunctions c
              JOIN agents a ON a.id = c."agentId"
              WHERE c."propertyId" = p.id
                AND a."userId" = auth_uid()::text
                AND c.status = 'active'
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "platform_admin_stage_progress_write" ON stage_progress;
CREATE POLICY "platform_admin_stage_progress_write" ON stage_progress
  FOR ALL
  USING (auth_user_type() = 'platform_admin');

-- ─── stage_gates ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "stage_gates_read" ON stage_gates;
CREATE POLICY "stage_gates_read" ON stage_gates
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM property_workflows pw
      JOIN properties p ON p.id = pw."propertyId"
      WHERE pw.id = stage_gates."propertyWorkflowId"
        AND (
          p."sellerId" = auth_uid()::text
          OR auth_user_type() = 'platform_admin'
          OR (
            auth_user_type() = 'agent'
            AND EXISTS (
              SELECT 1 FROM conjunctions c
              JOIN agents a ON a.id = c."agentId"
              WHERE c."propertyId" = p.id
                AND a."userId" = auth_uid()::text
                AND c.status = 'active'
            )
          )
        )
    )
  );

DROP POLICY IF EXISTS "platform_admin_stage_gates_write" ON stage_gates;
CREATE POLICY "platform_admin_stage_gates_write" ON stage_gates
  FOR ALL
  USING (auth_user_type() = 'platform_admin');

-- ─── conjunctions ────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "agents_own_conjunctions" ON conjunctions;
CREATE POLICY "agents_own_conjunctions" ON conjunctions
  FOR SELECT
  USING (
    auth_user_type() = 'agent'
    AND "agentId" IN (
      SELECT id FROM agents WHERE "userId" = auth_uid()::text
    )
  );

DROP POLICY IF EXISTS "sellers_property_conjunctions" ON conjunctions;
CREATE POLICY "sellers_property_conjunctions" ON conjunctions
  FOR SELECT
  USING (
    auth_user_type() = 'seller'
    AND "propertyId" IN (
      SELECT id FROM properties WHERE "sellerId" = auth_uid()::text
    )
  );

DROP POLICY IF EXISTS "platform_admin_conjunctions" ON conjunctions;
CREATE POLICY "platform_admin_conjunctions" ON conjunctions
  FOR ALL
  USING (auth_user_type() = 'platform_admin');

-- ─── organisations ───────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "org_admin_own_org" ON organisations;
CREATE POLICY "org_admin_own_org" ON organisations
  FOR SELECT
  USING (
    auth_user_type() = 'org_admin'
    AND id IN (
      SELECT "organisationId" FROM buyer_profiles
      WHERE "userId" = auth_uid()::text
    )
  );

DROP POLICY IF EXISTS "platform_admin_organisations" ON organisations;
CREATE POLICY "platform_admin_organisations" ON organisations
  FOR ALL
  USING (auth_user_type() = 'platform_admin');

-- ─── buyer_profiles ──────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "buyers_own_profile" ON buyer_profiles;
CREATE POLICY "buyers_own_profile" ON buyer_profiles
  FOR ALL
  USING (
    auth_user_type() = 'buyer'
    AND "userId" = auth_uid()::text
  );

DROP POLICY IF EXISTS "platform_admin_buyer_profiles" ON buyer_profiles;
CREATE POLICY "platform_admin_buyer_profiles" ON buyer_profiles
  FOR ALL
  USING (auth_user_type() = 'platform_admin');

-- ─── audit_logs ──────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS "platform_admin_audit_logs" ON audit_logs;
CREATE POLICY "platform_admin_audit_logs" ON audit_logs
  FOR SELECT
  USING (auth_user_type() = 'platform_admin');
