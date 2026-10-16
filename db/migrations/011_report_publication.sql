ALTER TABLE reporting.snapshots ADD CONSTRAINT snapshots_program_identity UNIQUE(id,program_id);
CREATE TABLE reporting.reports (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 snapshot_id uuid NOT NULL, previous_snapshot_id uuid,
 title text NOT NULL CHECK(length(title) BETWEEN 3 AND 160), narrative text NOT NULL CHECK(length(narrative) BETWEEN 3 AND 12000),
 author_id uuid NOT NULL REFERENCES iam.users(id), reviewer_id uuid REFERENCES iam.users(id), publisher_id uuid REFERENCES iam.users(id),
 status text NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED','APPROVED','REJECTED','PUBLISHED')),
 review_reason text, created_at timestamptz NOT NULL DEFAULT now(), reviewed_at timestamptz, published_at timestamptz,
 payload_hash text NOT NULL, version integer NOT NULL DEFAULT 1,
 FOREIGN KEY(snapshot_id,program_id) REFERENCES reporting.snapshots(id,program_id),
 FOREIGN KEY(previous_snapshot_id,program_id) REFERENCES reporting.snapshots(id,program_id),
 CHECK(reviewer_id IS NULL OR reviewer_id <> author_id), CHECK(snapshot_id IS DISTINCT FROM previous_snapshot_id),
 CHECK((status='SUBMITTED' AND reviewer_id IS NULL AND reviewed_at IS NULL) OR (status<>'SUBMITTED' AND reviewer_id IS NOT NULL AND reviewed_at IS NOT NULL)),
 CHECK((status='PUBLISHED') = (published_at IS NOT NULL AND publisher_id IS NOT NULL))
);
CREATE INDEX ON reporting.reports(program_id,created_at DESC);
CREATE FUNCTION protect_report() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Report history cannot be deleted'; END IF;
 IF OLD.status IN ('PUBLISHED','REJECTED') THEN RAISE EXCEPTION 'Final report is immutable'; END IF;
 IF ROW(NEW.program_id,NEW.snapshot_id,NEW.previous_snapshot_id,NEW.title,NEW.narrative,NEW.author_id,NEW.created_at,NEW.payload_hash)
 IS DISTINCT FROM ROW(OLD.program_id,OLD.snapshot_id,OLD.previous_snapshot_id,OLD.title,OLD.narrative,OLD.author_id,OLD.created_at,OLD.payload_hash)
 THEN RAISE EXCEPTION 'Submitted report content is immutable'; END IF;
 IF NOT ((OLD.status='SUBMITTED' AND NEW.status IN ('APPROVED','REJECTED')) OR (OLD.status='APPROVED' AND NEW.status='PUBLISHED'))
 OR NEW.version <> OLD.version+1 THEN RAISE EXCEPTION 'Invalid report transition'; END IF;
 IF OLD.status='APPROVED' AND ROW(NEW.reviewer_id,NEW.review_reason,NEW.reviewed_at) IS DISTINCT FROM ROW(OLD.reviewer_id,OLD.review_reason,OLD.reviewed_at)
 THEN RAISE EXCEPTION 'Report review is immutable'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER report_immutable_content BEFORE UPDATE OR DELETE ON reporting.reports FOR EACH ROW EXECUTE FUNCTION protect_report();
