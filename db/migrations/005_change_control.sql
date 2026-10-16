ALTER TABLE governance.decisions ADD CONSTRAINT decision_program_unique UNIQUE(id,program_id);
CREATE TABLE governance.change_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 subject_node_id uuid NOT NULL, title text NOT NULL, reason text NOT NULL, alternatives text NOT NULL,
 risk_and_mitigation text NOT NULL, target_version bigint NOT NULL,
 before_data jsonb NOT NULL, changes jsonb NOT NULL, impact jsonb NOT NULL, impact_hash text NOT NULL,
 status text NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED','APPROVED','REJECTED','APPLIED','CANCELLED')),
 requested_by uuid NOT NULL REFERENCES iam.users(id), requested_at timestamptz NOT NULL DEFAULT now(),
 reviewed_by uuid REFERENCES iam.users(id), reviewed_at timestamptz, review_reason text,
 applied_by uuid REFERENCES iam.users(id), applied_at timestamptz,
 cancelled_by uuid REFERENCES iam.users(id), cancelled_at timestamptz, cancellation_reason text,
 decision_id uuid, version bigint NOT NULL DEFAULT 1,
 FOREIGN KEY(subject_node_id,program_id) REFERENCES portfolio.program_nodes(id,program_id),
 FOREIGN KEY(decision_id,program_id) REFERENCES governance.decisions(id,program_id),
 CHECK(reviewed_by IS NULL OR reviewed_by <> requested_by)
);
CREATE INDEX ON governance.change_requests(program_id,status,requested_at DESC);
CREATE OR REPLACE FUNCTION protect_change_request() RETURNS trigger AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Solicitação de mudança é preservada'; END IF;
 IF OLD.status IN ('REJECTED','APPLIED','CANCELLED') THEN RAISE EXCEPTION 'Solicitação encerrada é imutável'; END IF;
 IF (to_jsonb(NEW) - ARRAY['status','reviewed_by','reviewed_at','review_reason','decision_id','applied_by','applied_at','cancelled_by','cancelled_at','cancellation_reason','version'])
   IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','reviewed_by','reviewed_at','review_reason','decision_id','applied_by','applied_at','cancelled_by','cancelled_at','cancellation_reason','version'])
 THEN RAISE EXCEPTION 'Proposta e impacto são imutáveis'; END IF;
 IF OLD.status='SUBMITTED' AND NEW.status NOT IN ('APPROVED','REJECTED','CANCELLED') THEN RAISE EXCEPTION 'Transição de mudança inválida'; END IF;
 IF OLD.status='APPROVED' AND (NEW.status NOT IN ('APPLIED','CANCELLED') OR NEW.reviewed_by IS DISTINCT FROM OLD.reviewed_by OR NEW.review_reason IS DISTINCT FROM OLD.review_reason OR NEW.decision_id IS DISTINCT FROM OLD.decision_id OR NEW.reviewed_at IS DISTINCT FROM OLD.reviewed_at)
 THEN RAISE EXCEPTION 'Decisão aprovada é preservada'; END IF;
 IF NEW.version <> OLD.version+1 THEN RAISE EXCEPTION 'Versão de mudança inválida'; END IF;
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_change_proposal BEFORE UPDATE OR DELETE ON governance.change_requests FOR EACH ROW EXECUTE FUNCTION protect_change_request();
CREATE OR REPLACE FUNCTION protect_change_decision() RETURNS trigger AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM governance.change_requests WHERE decision_id=OLD.id) THEN RAISE EXCEPTION 'Decisão de change control é imutável'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER immutable_change_decision BEFORE UPDATE OR DELETE ON governance.decisions FOR EACH ROW EXECUTE FUNCTION protect_change_decision();
