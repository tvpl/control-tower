CREATE TABLE integration.jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id), actor_id uuid NOT NULL REFERENCES iam.users(id),
 kind text NOT NULL CHECK(kind IN ('IMPORT_PREVIEW','IMPORT_COMMIT','REPORT_PDF','SYNC')),
 status text NOT NULL DEFAULT 'QUEUED' CHECK(status IN ('QUEUED','RUNNING','SUCCEEDED','FAILED','CONFLICT','CANCELLED')),
 input jsonb NOT NULL, output jsonb, error text, attempts integer NOT NULL DEFAULT 0, max_attempts integer NOT NULL DEFAULT 3,
 available_at timestamptz NOT NULL DEFAULT now(), lease_until timestamptz, lease_token uuid,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(id,program_id)
);
CREATE INDEX ON integration.jobs(status,available_at,lease_until);
CREATE INDEX ON integration.jobs(program_id,created_at DESC);
CREATE TABLE integration.job_artifacts (
 job_id uuid PRIMARY KEY, program_id uuid NOT NULL, filename text NOT NULL, mime_type text NOT NULL, payload_base64 text NOT NULL,
 digest text NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(job_id,program_id) REFERENCES integration.jobs(id,program_id)
);
CREATE TABLE integration.field_provenance (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), sequence bigserial UNIQUE, program_id uuid NOT NULL REFERENCES portfolio.programs(id), entity_type text NOT NULL, entity_id uuid NOT NULL,
 field_name text NOT NULL, value_hash text NOT NULL, source_type text NOT NULL CHECK(source_type IN ('MANUAL','IMPORT','CONNECTOR')),
 source_url text, source_namespace text, external_id text, source_version text, source_updated_at timestamptz,
 actor_id uuid NOT NULL REFERENCES iam.users(id), job_id uuid REFERENCES integration.jobs(id), occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON integration.field_provenance(program_id,entity_type,entity_id,field_name,occurred_at DESC);
CREATE TRIGGER immutable_field_provenance BEFORE UPDATE OR DELETE ON integration.field_provenance FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TABLE integration.import_sources (
 program_id uuid NOT NULL REFERENCES portfolio.programs(id), namespace text NOT NULL, external_id text NOT NULL, deliverable_id uuid NOT NULL,
 PRIMARY KEY(program_id,namespace,external_id), FOREIGN KEY(deliverable_id,program_id) REFERENCES delivery.deliverables(id,program_id)
);
ALTER TABLE integration.field_provenance ADD COLUMN classification text NOT NULL DEFAULT 'INTERNAL';
CREATE TABLE integration.job_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), job_id uuid NOT NULL REFERENCES integration.jobs(id), lease_token uuid NOT NULL UNIQUE,
 started_at timestamptz NOT NULL DEFAULT now(), finished_at timestamptz, status text NOT NULL DEFAULT 'RUNNING', error text
);
