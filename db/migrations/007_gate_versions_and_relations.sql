ALTER TABLE delivery.deliverable_capabilities ADD CONSTRAINT valid_contribution_type CHECK(contribution_type IN ('REQUIRED','OPTIONAL','SUPPORTING'));
ALTER TABLE architecture.capability_components ADD CONSTRAINT valid_component_relation CHECK(relation_type IN ('USES','IMPLEMENTS','SUPPORTS','DEPENDS_ON'));
ALTER TABLE governance.gate_definitions ADD COLUMN criteria text NOT NULL DEFAULT '';
CREATE TABLE governance.gate_definition_versions (
 gate_id uuid NOT NULL REFERENCES governance.gate_definitions(id), version integer NOT NULL,
 frozen_payload jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(gate_id,version)
);
INSERT INTO governance.gate_definition_versions(gate_id,version,frozen_payload) SELECT id,version,to_jsonb(g) FROM governance.gate_definitions g;
CREATE TRIGGER immutable_gate_version BEFORE UPDATE OR DELETE ON governance.gate_definition_versions FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE OR REPLACE FUNCTION record_gate_version() RETURNS trigger AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW.version<>OLD.version+1 THEN RAISE EXCEPTION 'Critério exige nova versão sequencial'; END IF;
 INSERT INTO governance.gate_definition_versions(gate_id,version,frozen_payload) VALUES(NEW.id,NEW.version,to_jsonb(NEW));
 RETURN NEW;
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER record_gate_definition AFTER INSERT OR UPDATE ON governance.gate_definitions FOR EACH ROW EXECUTE FUNCTION record_gate_version();
