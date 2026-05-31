-- Row Level Security Policies (S1-003)
-- Run after `prisma migrate dev --name init` via Supabase SQL editor or psql

-- Enable RLS on all critical tables
ALTER TABLE properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_workflows ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE stage_gates ENABLE ROW LEVEL SECURITY;
ALTER TABLE organisations ENABLE ROW LEVEL SECURITY;
ALTER TABLE buyer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE conjunctions ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

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

-- ─── properties ──────────────────────────────────────────────────────────────

-- Sellers see only their own properties
CREATE POLICY "sellers_own_properties" ON properties
  FOR ALL
  USING (
    auth_user_type() = 'seller'
    AND seller_id = auth_uid()::text
  );

-- Agents see properties where they have an active conjunction
CREATE POLICY "agents_conjuncted_properties" ON properties
  FOR SELECT
  USING (
    auth_user_type() = 'agent'
    AND EXISTS (
      SELECT 1 FROM conjunctions
      WHERE conjunctions.property_id = properties.id
        AND conjunctions.agent_id IN (
          SELECT id FROM agents WHERE user_id = auth_uid()::text
        )
        AND conjunctions.status = 'active'
    )
  );

-- Platform admins see everything
CREATE POLICY "platform_admin_all_properties" ON properties
  FOR ALL
  USING (auth_user_type() = 'platform_admin');

-- ─── property_workflows ──────────────────────────────────────────────────────

CREATE POLICY "property_workflows_via_property" ON property_workflows
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM properties
      WHERE properties.id = property_workflows.property_id
    )
  );

CREATE POLICY "platform_admin_property_workflows" ON property_workflows
  FOR ALL
  USING (auth_user_type() = 'platform_admin');

-- ─── stage_progress ──────────────────────────────────────────────────────────

-- Sellers and agents can read stage progress for their properties
CREATE POLICY "stage_progress_read" ON stage_progress
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM property_workflows pw
      JOIN properties p ON p.id = pw.property_id
      WHERE pw.id = stage_progress.property_workflow_id
        AND (
          p.seller_id = auth_uid()::text
          OR auth_user_type() = 'platform_admin'
          OR (
            auth_user_type() = 'agent'
            AND EXISTS (
              SELECT 1 FROM conjunctions c
              JOIN agents a ON a.id = c.agent_id
              WHERE c.property_id = p.id
                AND a.user_id = auth_uid()::text
                AND c.status = 'active'
            )
          )
        )
    )
  );

-- Only platform can write stage progress
CREATE POLICY "platform_admin_stage_progress_write" ON stage_progress
  FOR ALL
  USING (auth_user_type() = 'platform_admin');

-- ─── organisations ───────────────────────────────────────────────────────────

-- Org admins see only their own organisation record (no member data)
CREATE POLICY "org_admin_own_org" ON organisations
  FOR SELECT
  USING (
    auth_user_type() = 'org_admin'
    AND id IN (
      SELECT organisation_id FROM buyer_profiles
      WHERE user_id = auth_uid()::text
    )
  );

CREATE POLICY "platform_admin_organisations" ON organisations
  FOR ALL
  USING (auth_user_type() = 'platform_admin');

-- ─── buyer_profiles ──────────────────────────────────────────────────────────

-- Buyers see only their own profile
CREATE POLICY "buyers_own_profile" ON buyer_profiles
  FOR ALL
  USING (
    auth_user_type() = 'buyer'
    AND user_id = auth_uid()::text
  );

CREATE POLICY "platform_admin_buyer_profiles" ON buyer_profiles
  FOR ALL
  USING (auth_user_type() = 'platform_admin');

-- ─── audit_logs ──────────────────────────────────────────────────────────────

-- Only platform_admin can read audit logs; service role writes them
CREATE POLICY "platform_admin_audit_logs" ON audit_logs
  FOR SELECT
  USING (auth_user_type() = 'platform_admin');
