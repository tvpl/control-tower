ALTER TABLE integration.connections ADD COLUMN gitlab_options jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE integration.connections ADD CONSTRAINT gitlab_options_object CHECK(jsonb_typeof(gitlab_options)='object');
