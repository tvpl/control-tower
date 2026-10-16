CREATE TABLE portfolio.priority_boards (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 entity_type text NOT NULL CHECK(entity_type IN ('deliverables','capabilities')),
 version bigint NOT NULL DEFAULT 1, updated_by uuid NOT NULL REFERENCES iam.users(id),
 updated_at timestamptz NOT NULL DEFAULT now(), reason text NOT NULL,
 UNIQUE(program_id,entity_type), UNIQUE(id,program_id)
);
CREATE TABLE portfolio.priority_entries (
 board_id uuid NOT NULL, program_id uuid NOT NULL, subject_node_id uuid NOT NULL,
 position integer NOT NULL CHECK(position>0), PRIMARY KEY(board_id,subject_node_id), UNIQUE(board_id,position),
 FOREIGN KEY(board_id,program_id) REFERENCES portfolio.priority_boards(id,program_id) ON DELETE CASCADE,
 FOREIGN KEY(subject_node_id,program_id) REFERENCES portfolio.program_nodes(id,program_id) ON DELETE CASCADE
);
CREATE INDEX ON portfolio.priority_entries(program_id);
