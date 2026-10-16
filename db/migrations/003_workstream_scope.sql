ALTER TABLE governance.raid_items ADD COLUMN workstream_id uuid;
ALTER TABLE governance.raid_items ADD CONSTRAINT raid_workstream_program_fk FOREIGN KEY(workstream_id,program_id) REFERENCES portfolio.workstreams(id,program_id);
CREATE INDEX ON governance.raid_items(program_id,workstream_id,status);
