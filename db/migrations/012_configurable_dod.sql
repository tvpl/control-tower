ALTER TABLE governance.gate_definitions ADD COLUMN program_id uuid REFERENCES portfolio.programs(id);
ALTER TABLE governance.gate_definitions DROP CONSTRAINT gate_definitions_code_key;
CREATE UNIQUE INDEX gate_code_scope ON governance.gate_definitions(COALESCE(program_id,'00000000-0000-0000-0000-000000000000'::uuid),code);
ALTER TABLE governance.gate_assessments ADD COLUMN context_key text;
CREATE TABLE governance.dod_profiles (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 code text NOT NULL, name text NOT NULL, rule jsonb NOT NULL DEFAULT '{}'::jsonb, gate_ids jsonb NOT NULL,
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(program_id,code), UNIQUE(id,program_id)
);
CREATE TABLE governance.dod_profile_versions (
 profile_id uuid NOT NULL REFERENCES governance.dod_profiles(id), version integer NOT NULL,
 frozen_payload jsonb NOT NULL, recorded_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(profile_id,version)
);
CREATE TRIGGER immutable_profile_version BEFORE UPDATE OR DELETE ON governance.dod_profile_versions FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE FUNCTION record_dod_profile() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='UPDATE' AND (NEW.version<>OLD.version+1 OR NEW.program_id<>OLD.program_id OR NEW.code<>OLD.code) THEN RAISE EXCEPTION 'Profile update requires next version and stable identity'; END IF;
 INSERT INTO governance.dod_profile_versions(profile_id,version,frozen_payload) VALUES(NEW.id,NEW.version,to_jsonb(NEW));
 RETURN NEW;
END;
$$;
CREATE TRIGGER version_dod_profile AFTER INSERT OR UPDATE ON governance.dod_profiles FOR EACH ROW EXECUTE FUNCTION record_dod_profile();
CREATE TRIGGER no_profile_delete BEFORE DELETE ON governance.dod_profiles FOR EACH ROW EXECUTE FUNCTION reject_mutation();
CREATE TABLE portfolio.layers (
 program_id uuid NOT NULL REFERENCES portfolio.programs(id), code text NOT NULL, name text NOT NULL,
 active boolean NOT NULL DEFAULT true, version integer NOT NULL DEFAULT 1, PRIMARY KEY(program_id,code)
);
CREATE FUNCTION seed_program_layers() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO portfolio.layers(program_id,code,name) SELECT NEW.id,v,v FROM unnest(ARRAY['CLIENT','CAAL','BACKEND','PARTNER','DATA','INFRA','SECURITY','OPERATIONS','QUALITY']) v;
 RETURN NEW;
END;
$$;
CREATE TRIGGER default_program_layers AFTER INSERT ON portfolio.programs FOR EACH ROW EXECUTE FUNCTION seed_program_layers();
INSERT INTO portfolio.layers(program_id,code,name) SELECT p.id,v,v FROM portfolio.programs p CROSS JOIN unnest(ARRAY['CLIENT','CAAL','BACKEND','PARTNER','DATA','INFRA','SECURITY','OPERATIONS','QUALITY']) v;
CREATE FUNCTION validate_deliverable_layer() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF (TG_OP='INSERT' OR NEW.layer IS DISTINCT FROM OLD.layer) AND NOT EXISTS(SELECT 1 FROM portfolio.layers WHERE program_id=NEW.program_id AND code=NEW.layer AND active) THEN RAISE EXCEPTION 'Layer is not active in this program'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER deliverable_layer_catalog BEFORE INSERT OR UPDATE ON delivery.deliverables FOR EACH ROW EXECUTE FUNCTION validate_deliverable_layer();

ALTER TABLE delivery.deliverables ADD COLUMN criticality text NOT NULL DEFAULT 'MEDIUM' CHECK(criticality IN ('LOW','MEDIUM','HIGH','CRITICAL'));
