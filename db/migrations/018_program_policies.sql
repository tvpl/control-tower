ALTER TABLE portfolio.programs ADD COLUMN health_policy jsonb NOT NULL DEFAULT '{"stale_days":7,"delay_tolerance_days":0,"dependency_minimum":"HIGH"}'::jsonb;
ALTER TABLE portfolio.programs ADD COLUMN ai_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE iam.notification_preferences (
 user_id uuid NOT NULL REFERENCES iam.users(id), program_id uuid NOT NULL REFERENCES portfolio.programs(id), enabled boolean NOT NULL DEFAULT true, updated_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(user_id,program_id)
);
