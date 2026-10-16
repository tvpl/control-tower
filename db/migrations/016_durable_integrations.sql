ALTER TABLE integration.connections ADD CONSTRAINT connection_program_identity UNIQUE(id,program_id);
ALTER TABLE integration.connections ADD COLUMN id_text text GENERATED ALWAYS AS(id::text) STORED;
ALTER TABLE integration.connections ADD CONSTRAINT connection_text_identity UNIQUE(id_text,program_id);
ALTER TABLE integration.connections ADD COLUMN project text NOT NULL DEFAULT '';
ALTER TABLE integration.connections ADD COLUMN deployment text NOT NULL DEFAULT 'CLOUD';
ALTER TABLE integration.connections ADD COLUMN jira_email text;
ALTER TABLE integration.connections ADD COLUMN state_mapping jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE integration.connections ADD COLUMN field_mapping jsonb NOT NULL DEFAULT '{"execution_status":"operationalState"}'::jsonb;
ALTER TABLE integration.connections ADD COLUMN execution_owner text NOT NULL DEFAULT 'CONTROL_TOWER' CHECK(execution_owner IN ('CONTROL_TOWER','EXTERNAL'));
ALTER TABLE integration.connections ADD COLUMN webhook_secret_env text;
ALTER TABLE integration.connections ADD COLUMN enabled boolean NOT NULL DEFAULT false;
ALTER TABLE integration.connections ADD COLUMN poll_interval_seconds integer NOT NULL DEFAULT 900 CHECK(poll_interval_seconds>=60);
ALTER TABLE integration.connections ADD COLUMN cursor text;
ALTER TABLE integration.connections ADD COLUMN failures integer NOT NULL DEFAULT 0;
ALTER TABLE integration.connections ADD COLUMN circuit_open_until timestamptz;
ALTER TABLE integration.connections ADD COLUMN last_attempt_at timestamptz;
ALTER TABLE integration.connections ADD COLUMN last_error text;
ALTER TABLE integration.connections ADD COLUMN created_by uuid REFERENCES iam.users(id);
ALTER TABLE integration.external_references ADD CONSTRAINT reference_connection_scope FOREIGN KEY(connection_id,program_id) REFERENCES integration.connections(id_text,program_id) NOT VALID;
ALTER TABLE integration.external_references ADD COLUMN sync_mode text NOT NULL DEFAULT 'REFERENCE' CHECK(sync_mode IN ('REFERENCE','EXECUTION'));
ALTER TABLE integration.external_references ADD COLUMN sync_state text NOT NULL DEFAULT 'PENDING';
ALTER TABLE integration.external_references ADD COLUMN version integer NOT NULL DEFAULT 1;
CREATE TABLE integration.inbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id), connection_id uuid NOT NULL,
 external_id text NOT NULL, source_updated_at timestamptz NOT NULL, payload jsonb NOT NULL, payload_hash text NOT NULL,
 status text NOT NULL DEFAULT 'NEW' CHECK(status IN ('NEW','APPLIED','CONFLICT','UNMAPPED','STALE','REFERENCE')),
 received_at timestamptz NOT NULL DEFAULT now(), processed_at timestamptz,
 FOREIGN KEY(connection_id,program_id) REFERENCES integration.connections(id,program_id), UNIQUE(connection_id,external_id,source_updated_at,payload_hash)
);
CREATE INDEX ON integration.inbox(program_id,connection_id,status,received_at DESC);
CREATE TABLE integration.sync_conflicts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id), connection_id uuid NOT NULL, inbox_id uuid NOT NULL REFERENCES integration.inbox(id), subject_node_id uuid NOT NULL,
 field_name text NOT NULL, current_value jsonb, incoming_value jsonb, expected_entity_version bigint NOT NULL,
 status text NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN','APPLIED','KEPT')), version integer NOT NULL DEFAULT 1,
 reason text, resolved_by uuid REFERENCES iam.users(id), resolved_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(connection_id,program_id) REFERENCES integration.connections(id,program_id), FOREIGN KEY(subject_node_id,program_id) REFERENCES portfolio.program_nodes(id,program_id), UNIQUE(inbox_id,subject_node_id,field_name)
);
CREATE FUNCTION protect_sync_conflict() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.status<>'OPEN' THEN RAISE EXCEPTION 'Conflict history is immutable'; END IF;
 IF ROW(NEW.program_id,NEW.connection_id,NEW.inbox_id,NEW.subject_node_id,NEW.field_name,NEW.current_value,NEW.incoming_value,NEW.expected_entity_version,NEW.created_at)
 IS DISTINCT FROM ROW(OLD.program_id,OLD.connection_id,OLD.inbox_id,OLD.subject_node_id,OLD.field_name,OLD.current_value,OLD.incoming_value,OLD.expected_entity_version,OLD.created_at)
 THEN RAISE EXCEPTION 'Conflict source is immutable'; END IF;
 IF NEW.status='OPEN' OR NEW.version<>OLD.version+1 OR NEW.resolved_by IS NULL OR length(NEW.reason)<3 THEN RAISE EXCEPTION 'Explicit reconciliation required'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER sync_conflict_history BEFORE UPDATE OR DELETE ON integration.sync_conflicts FOR EACH ROW EXECUTE FUNCTION protect_sync_conflict();
CREATE TABLE integration.webhook_deliveries (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), connection_id uuid NOT NULL REFERENCES integration.connections(id), delivery_key text NOT NULL, body_hash text NOT NULL, received_at timestamptz NOT NULL DEFAULT now(), UNIQUE(connection_id,delivery_key)
);
CREATE TABLE governance.notifications (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id), user_id uuid NOT NULL REFERENCES iam.users(id), event_id uuid NOT NULL REFERENCES audit.outbox(id), title text NOT NULL, body text NOT NULL,
 read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(user_id,event_id)
);
CREATE INDEX ON governance.notifications(user_id,read_at,created_at DESC);
ALTER TABLE integration.sync_runs ADD COLUMN job_id uuid REFERENCES integration.jobs(id);
ALTER TABLE integration.sync_runs ADD CONSTRAINT sync_run_job_identity UNIQUE(job_id);
CREATE UNIQUE INDEX one_active_connection_sync ON integration.jobs(program_id,(input->>'connectionId')) WHERE kind='SYNC' AND status IN ('QUEUED','RUNNING');
