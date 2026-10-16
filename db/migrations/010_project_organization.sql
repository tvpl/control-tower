CREATE TABLE portfolio.areas (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 code text NOT NULL, name text NOT NULL, owner_id uuid REFERENCES iam.users(id), version bigint NOT NULL DEFAULT 1,
 UNIQUE(program_id,code), UNIQUE(id,program_id)
);
CREATE TABLE portfolio.squads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 code text NOT NULL, name text NOT NULL, area_id uuid, lead_id uuid REFERENCES iam.users(id), version bigint NOT NULL DEFAULT 1,
 UNIQUE(program_id,code), UNIQUE(id,program_id),
 FOREIGN KEY(area_id,program_id) REFERENCES portfolio.areas(id,program_id)
);
ALTER TABLE portfolio.workstreams ADD COLUMN kind text NOT NULL DEFAULT 'OTHER'
 CHECK(kind IN ('DEVELOPMENT','BUSINESS','INFRASTRUCTURE','PROVISIONING','SPIKE','OTHER'));
ALTER TABLE delivery.deliverables ADD COLUMN area_id uuid;
ALTER TABLE delivery.deliverables ADD COLUMN squad_id uuid;
ALTER TABLE delivery.deliverables ADD CONSTRAINT deliverable_area_program_fk FOREIGN KEY(area_id,program_id) REFERENCES portfolio.areas(id,program_id);
ALTER TABLE delivery.deliverables ADD CONSTRAINT deliverable_squad_program_fk FOREIGN KEY(squad_id,program_id) REFERENCES portfolio.squads(id,program_id);
CREATE INDEX ON delivery.deliverables(program_id,area_id,squad_id);
-- The consistency rule is also enforced in SQL, including direct updates of a squad's area.
CREATE FUNCTION portfolio.validate_deliverable_organization() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE squad_area uuid;
BEGIN
 IF NEW.squad_id IS NOT NULL AND NEW.area_id IS NOT NULL THEN
  SELECT area_id INTO squad_area FROM portfolio.squads WHERE id=NEW.squad_id AND program_id=NEW.program_id;
  IF squad_area IS NOT NULL AND squad_area<>NEW.area_id THEN
   RAISE EXCEPTION 'Area and squad disagree' USING ERRCODE='23514';
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER deliverable_organization BEFORE INSERT OR UPDATE ON delivery.deliverables FOR EACH ROW EXECUTE FUNCTION portfolio.validate_deliverable_organization();
CREATE FUNCTION portfolio.validate_squad_area() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.area_id IS DISTINCT FROM OLD.area_id AND NEW.area_id IS NOT NULL AND EXISTS(
  SELECT 1 FROM delivery.deliverables WHERE squad_id=NEW.id AND area_id IS NOT NULL AND area_id<>NEW.area_id
 ) THEN
  RAISE EXCEPTION 'Assigned deliverables disagree with squad area' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER squad_area_consistency BEFORE UPDATE ON portfolio.squads FOR EACH ROW EXECUTE FUNCTION portfolio.validate_squad_area();
