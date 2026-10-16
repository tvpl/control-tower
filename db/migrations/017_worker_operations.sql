CREATE TABLE integration.worker_heartbeats (
 id text PRIMARY KEY, last_seen_at timestamptz NOT NULL DEFAULT now(), status text NOT NULL, detail jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS outbox_pending ON audit.outbox(occurred_at) WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS deliverable_program_stage ON delivery.deliverables(program_id,delivery_stage,id);
CREATE INDEX IF NOT EXISTS deliverable_program_front ON delivery.deliverables(program_id,workstream_id,id);
CREATE INDEX IF NOT EXISTS deliverable_program_owner ON delivery.deliverables(program_id,owner_id,id);
CREATE INDEX IF NOT EXISTS deliverable_program_layer ON delivery.deliverables(program_id,layer,id);
CREATE INDEX IF NOT EXISTS deliverable_program_squad ON delivery.deliverables(program_id,squad_id,id);
CREATE INDEX IF NOT EXISTS node_program_entity ON portfolio.program_nodes(program_id,entity_type,entity_id);
