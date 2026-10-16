CREATE TABLE governance.observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 subject_node_id uuid,
 author_id uuid NOT NULL REFERENCES iam.users(id),
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 3 AND 160),
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 3 AND 8000),
 important boolean NOT NULL DEFAULT false,
 version bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(subject_node_id,program_id) REFERENCES portfolio.program_nodes(id,program_id)
);
CREATE INDEX ON governance.observations(program_id,subject_node_id,created_at DESC);
