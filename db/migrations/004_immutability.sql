CREATE OR REPLACE FUNCTION protect_baseline() RETURNS trigger AS $$
BEGIN
 IF OLD.status='APPROVED' THEN RAISE EXCEPTION 'Baseline aprovada é imutável'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
CREATE OR REPLACE FUNCTION protect_baseline_item() RETURNS trigger AS $$
BEGIN
 IF TG_OP!='INSERT' AND EXISTS(SELECT 1 FROM delivery.baselines WHERE id=OLD.baseline_id AND status='APPROVED') THEN RAISE EXCEPTION 'Itens de baseline aprovada são imutáveis'; END IF;
 IF TG_OP!='DELETE' AND EXISTS(SELECT 1 FROM delivery.baselines WHERE id=NEW.baseline_id AND status='APPROVED') THEN RAISE EXCEPTION 'Itens de baseline aprovada são imutáveis'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
