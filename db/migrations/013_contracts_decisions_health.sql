CREATE TABLE architecture.suppliers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id), code text NOT NULL, name text NOT NULL,
 owner_id uuid REFERENCES iam.users(id), status text NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','INACTIVE')),
 contact_url text, classification text NOT NULL DEFAULT 'INTERNAL', version bigint NOT NULL DEFAULT 1,
 UNIQUE(program_id,code), UNIQUE(id,program_id)
);
CREATE TABLE architecture.contracts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id), code text NOT NULL, name text NOT NULL,
 source_component_id uuid NOT NULL, target_component_id uuid NOT NULL, supplier_id uuid, supersedes_id uuid,
 protocol text NOT NULL, contract_version text NOT NULL, specification_url text, sla_ms integer CHECK(sla_ms>0), sla_notes text,
 availability_target numeric(6,3) CHECK(availability_target>0 AND availability_target<=100), owner_id uuid REFERENCES iam.users(id),
 status text NOT NULL DEFAULT 'DRAFT' CHECK(status IN ('DRAFT','APPROVED','REJECTED')),
 created_by uuid NOT NULL REFERENCES iam.users(id), reviewed_by uuid REFERENCES iam.users(id), reviewed_at timestamptz, review_reason text,
 version bigint NOT NULL DEFAULT 1, UNIQUE(program_id,code,contract_version), UNIQUE(id,program_id), CHECK(source_component_id<>target_component_id),
 FOREIGN KEY(source_component_id,program_id) REFERENCES architecture.components(id,program_id),
 FOREIGN KEY(target_component_id,program_id) REFERENCES architecture.components(id,program_id),
 FOREIGN KEY(supplier_id,program_id) REFERENCES architecture.suppliers(id,program_id),
 FOREIGN KEY(supersedes_id,program_id) REFERENCES architecture.contracts(id,program_id), CHECK(created_by IS DISTINCT FROM reviewed_by)
);
ALTER TABLE governance.decisions ADD COLUMN created_by uuid REFERENCES iam.users(id);
ALTER TABLE governance.decisions ADD COLUMN approval_role text NOT NULL DEFAULT 'PMO' CHECK(approval_role IN ('PMO','EXECUTIVE','CHIEF_ARCHITECT'));
ALTER TABLE governance.decisions ADD COLUMN reviewed_by uuid REFERENCES iam.users(id);
ALTER TABLE governance.decisions ADD COLUMN reviewed_at timestamptz;
ALTER TABLE governance.decisions ADD COLUMN review_reason text;
UPDATE governance.decisions SET created_by=owner_id WHERE created_by IS NULL;
CREATE FUNCTION protect_reviewed_record() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF OLD.status IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'Reviewed record is immutable; create a new version'; END IF;
 IF TG_OP='UPDATE' AND NEW.status<>OLD.status AND (NEW.reviewed_by IS NULL OR NEW.reviewed_at IS NULL OR length(NEW.review_reason)<3 OR NEW.reviewed_by=NEW.created_by) THEN RAISE EXCEPTION 'Review requires independent approver and reason'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;
CREATE TRIGGER contract_review_guard BEFORE UPDATE OR DELETE ON architecture.contracts FOR EACH ROW EXECUTE FUNCTION protect_reviewed_record();
CREATE TRIGGER decision_review_guard BEFORE UPDATE OR DELETE ON governance.decisions FOR EACH ROW EXECUTE FUNCTION protect_reviewed_record();
CREATE TABLE governance.health_overrides (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id), subject_node_id uuid NOT NULL,
 action text NOT NULL CHECK(action IN ('SET','CLEAR')), health text CHECK(health IN ('UNKNOWN','ON_TRACK','AT_RISK','CRITICAL')),
 reason text NOT NULL CHECK(length(reason) BETWEEN 3 AND 2000), expires_at timestamptz, actor_id uuid NOT NULL REFERENCES iam.users(id),
 created_at timestamptz NOT NULL DEFAULT now(), FOREIGN KEY(subject_node_id,program_id) REFERENCES portfolio.program_nodes(id,program_id),
 CHECK((action='SET' AND health IS NOT NULL AND expires_at IS NOT NULL) OR (action='CLEAR' AND health IS NULL AND expires_at IS NULL))
);
CREATE INDEX ON governance.health_overrides(program_id,subject_node_id,created_at DESC,id DESC);
CREATE TRIGGER immutable_health_override BEFORE UPDATE OR DELETE ON governance.health_overrides FOR EACH ROW EXECUTE FUNCTION reject_mutation();

ALTER TABLE architecture.components ADD COLUMN supplier_id uuid;
ALTER TABLE architecture.components ADD FOREIGN KEY(supplier_id,program_id) REFERENCES architecture.suppliers(id,program_id);
