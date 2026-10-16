ALTER TABLE delivery.baselines ADD COLUMN proposed_by uuid REFERENCES iam.users(id);
ALTER TABLE delivery.baselines ADD COLUMN proposal_reason text;
ALTER TABLE delivery.baselines ADD COLUMN proposal_hash text;
ALTER TABLE delivery.baselines ADD COLUMN proposal_context jsonb;
ALTER TABLE delivery.baselines ADD COLUMN review_reason text;
ALTER TABLE delivery.baselines ADD COLUMN reviewed_by uuid REFERENCES iam.users(id);
ALTER TABLE delivery.baselines ADD COLUMN reviewed_at timestamptz;
ALTER TABLE delivery.baselines ADD CONSTRAINT baseline_separate_reviewer CHECK(proposed_by IS NULL OR reviewed_by IS NULL OR proposed_by <> reviewed_by);
CREATE OR REPLACE FUNCTION protect_baseline() RETURNS trigger AS $$
BEGIN
 IF OLD.status IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'Baseline encerrada é imutável'; END IF;
 IF OLD.status='SUBMITTED' THEN
  IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Baseline submetida é preservada'; END IF;
  IF NEW.status NOT IN ('APPROVED','REJECTED') THEN RAISE EXCEPTION 'Transição de baseline inválida'; END IF;
  IF (to_jsonb(NEW) - ARRAY['status','approved_by','approved_at','reviewed_by','reviewed_at','review_reason'])
   IS DISTINCT FROM (to_jsonb(OLD) - ARRAY['status','approved_by','approved_at','reviewed_by','reviewed_at','review_reason'])
  THEN RAISE EXCEPTION 'Proposta de baseline é imutável'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION protect_baseline_item() RETURNS trigger AS $$
BEGIN
 IF TG_OP <> 'INSERT' AND EXISTS(SELECT 1 FROM delivery.baselines WHERE id=OLD.baseline_id AND status IN ('SUBMITTED','APPROVED','REJECTED')) THEN RAISE EXCEPTION 'Itens submetidos são imutáveis'; END IF;
 IF TG_OP <> 'DELETE' AND EXISTS(SELECT 1 FROM delivery.baselines WHERE id=NEW.baseline_id AND status IN ('SUBMITTED','APPROVED','REJECTED')) THEN RAISE EXCEPTION 'Itens submetidos são imutáveis'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
