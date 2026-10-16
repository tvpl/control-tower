ALTER TABLE iam.users ADD COLUMN password_hash text;
CREATE TABLE iam.memberships (
 user_id uuid NOT NULL REFERENCES iam.users(id), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 role text NOT NULL, workstream_id uuid REFERENCES portfolio.workstreams(id), gate_categories jsonb NOT NULL DEFAULT '[]',
 PRIMARY KEY(user_id,program_id,role)
);
ALTER TABLE portfolio.programs ADD COLUMN demo boolean NOT NULL DEFAULT false;
ALTER TABLE portfolio.domains ADD COLUMN inventory_maturity text NOT NULL DEFAULT 'IDENTIFIED';
ALTER TABLE portfolio.domains ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE portfolio.workstreams ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE delivery.deliverables ADD COLUMN acceptance_criteria text NOT NULL DEFAULT '';
ALTER TABLE delivery.deliverables ADD COLUMN accepted boolean NOT NULL DEFAULT false;
ALTER TABLE delivery.deliverables ADD COLUMN transverse_obligation text;
ALTER TABLE architecture.components ADD COLUMN owner_id uuid REFERENCES iam.users(id);
ALTER TABLE architecture.components ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE delivery.releases ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE governance.dependencies ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE governance.raid_items ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE governance.gate_assessments ADD COLUMN version bigint NOT NULL DEFAULT 1;
ALTER TABLE governance.gate_assessments ADD COLUMN expires_at timestamptz;
ALTER TABLE governance.gate_assessments ADD COLUMN accepted_risk text;
CREATE UNIQUE INDEX assessment_subject_gate ON governance.gate_assessments(subject_node_id,gate_id);
CREATE TABLE evidence_records (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 subject_node_id uuid NOT NULL, title text NOT NULL, url text NOT NULL, source text NOT NULL, artifact_version text NOT NULL,
 classification text NOT NULL, author_id uuid NOT NULL REFERENCES iam.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), version bigint NOT NULL DEFAULT 1,
 FOREIGN KEY(subject_node_id,program_id) REFERENCES portfolio.program_nodes(id,program_id)
);
CREATE TABLE governance.decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 code text NOT NULL, name text NOT NULL, rationale text NOT NULL, alternatives text NOT NULL,
 owner_id uuid REFERENCES iam.users(id), due_date date, status text NOT NULL DEFAULT 'PROPOSED',
 version bigint NOT NULL DEFAULT 1, UNIQUE(program_id,code)
);
CREATE TABLE delivery.milestones (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 release_id uuid NOT NULL, name text NOT NULL, baseline_date date, forecast_date date,
 version bigint NOT NULL DEFAULT 1, FOREIGN KEY(release_id,program_id) REFERENCES delivery.releases(id,program_id)
);
CREATE TABLE integration.connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 name text NOT NULL, connector_type text NOT NULL, base_url text NOT NULL, secret_env text NOT NULL,
 status text NOT NULL DEFAULT 'NOT_CONFIGURED', last_synced_at timestamptz, version bigint NOT NULL DEFAULT 1
);
CREATE TABLE integration.sync_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 connection_id uuid NOT NULL REFERENCES integration.connections(id), status text NOT NULL, detail text,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE audit.outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 event_type text NOT NULL, aggregate_id uuid NOT NULL, correlation_id text NOT NULL,
 payload jsonb NOT NULL, occurred_at timestamptz NOT NULL DEFAULT now(), published_at timestamptz
);
CREATE TABLE iam.saved_views (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES iam.users(id),
 program_id uuid NOT NULL REFERENCES portfolio.programs(id), name text NOT NULL, filters jsonb NOT NULL
);
CREATE TABLE audit.idempotency (
 actor_id uuid NOT NULL REFERENCES iam.users(id), key text NOT NULL, request_hash text NOT NULL,
 response jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(actor_id,key)
);
CREATE OR REPLACE FUNCTION reject_mutation() RETURNS trigger AS $$
BEGIN RAISE EXCEPTION 'Registro imutável'; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_snapshot BEFORE UPDATE OR DELETE ON reporting.snapshots FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TRIGGER immutable_audit BEFORE UPDATE OR DELETE ON audit.audit_events FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE OR REPLACE FUNCTION protect_baseline() RETURNS trigger AS $$
BEGIN IF OLD.status = 'APPROVED' THEN RAISE EXCEPTION 'Baseline aprovada é imutável'; END IF; RETURN NEW; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_baseline BEFORE UPDATE OR DELETE ON delivery.baselines FOR EACH ROW EXECUTE FUNCTION protect_baseline();
CREATE OR REPLACE FUNCTION protect_baseline_item() RETURNS trigger AS $$
DECLARE bid uuid;
BEGIN bid := CASE WHEN TG_OP='INSERT' THEN NEW.baseline_id ELSE OLD.baseline_id END;
IF EXISTS(SELECT 1 FROM delivery.baselines WHERE id=bid AND status='APPROVED') THEN RAISE EXCEPTION 'Itens de baseline aprovada são imutáveis'; END IF;
IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF; END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_baseline_items BEFORE INSERT OR UPDATE OR DELETE ON delivery.baseline_items FOR EACH ROW EXECUTE FUNCTION protect_baseline_item();
CREATE INDEX ON portfolio.capabilities(program_id,domain_id);
CREATE INDEX ON governance.gate_assessments(program_id,subject_node_id);
CREATE INDEX ON reporting.snapshots(program_id,as_of DESC);
