ALTER TABLE iam.memberships DROP CONSTRAINT memberships_pkey;
ALTER TABLE iam.memberships ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE iam.memberships ADD PRIMARY KEY(id);
CREATE UNIQUE INDEX membership_scope_identity ON iam.memberships(user_id,program_id,role,COALESCE(workstream_id,'00000000-0000-0000-0000-000000000000'::uuid));
ALTER TABLE iam.memberships ADD FOREIGN KEY(workstream_id,program_id) REFERENCES portfolio.workstreams(id,program_id);
ALTER TABLE iam.memberships ADD COLUMN version integer NOT NULL DEFAULT 1;
ALTER TABLE iam.memberships ADD COLUMN data_clearance text NOT NULL DEFAULT 'INTERNAL' CHECK(data_clearance IN ('INTERNAL','CONFIDENTIAL','RESTRICTED'));
ALTER TABLE iam.memberships ADD COLUMN domain_ids jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE iam.memberships ADD COLUMN expires_at timestamptz;
CREATE TABLE iam.api_tokens (
 id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES iam.users(id), name text NOT NULL,
 token_digest text NOT NULL UNIQUE, program_ids jsonb NOT NULL, access text NOT NULL CHECK(access IN ('READ','WRITE')),
 created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL, revoked_at timestamptz
);
CREATE INDEX ON iam.api_tokens(user_id,expires_at);
CREATE TABLE iam.login_buckets (
 key_hash text PRIMARY KEY, hits integer NOT NULL, expires_at timestamptz NOT NULL
);
CREATE INDEX ON iam.login_buckets(expires_at);
CREATE UNIQUE INDEX user_email_identity ON iam.users(lower(email)) WHERE email IS NOT NULL;
