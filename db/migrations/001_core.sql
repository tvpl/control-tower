-- PostgreSQL 16+; DDL de referência para núcleo. Aplicar migrations por domínio em produção.
-- gen_random_uuid is built into PostgreSQL.
CREATE SCHEMA IF NOT EXISTS iam;
CREATE SCHEMA IF NOT EXISTS portfolio;
CREATE SCHEMA IF NOT EXISTS architecture;
CREATE SCHEMA IF NOT EXISTS delivery;
CREATE SCHEMA IF NOT EXISTS governance;
CREATE SCHEMA IF NOT EXISTS integration;
CREATE SCHEMA IF NOT EXISTS reporting;
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE iam.users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), subject text NOT NULL UNIQUE,
 display_name text NOT NULL, email text, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE portfolio.programs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 name text NOT NULL, description text, status text NOT NULL DEFAULT 'ACTIVE',
 timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
 created_at timestamptz NOT NULL DEFAULT now(), version bigint NOT NULL DEFAULT 1
);
CREATE TABLE portfolio.domains (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 code text NOT NULL, name text NOT NULL, owner_id uuid REFERENCES iam.users(id),
 UNIQUE(program_id,code), UNIQUE(id,program_id)
);
CREATE TABLE portfolio.workstreams (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 code text NOT NULL, name text NOT NULL, lead_id uuid REFERENCES iam.users(id),
 UNIQUE(program_id,code), UNIQUE(id,program_id)
);
CREATE TABLE portfolio.capabilities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 domain_id uuid NOT NULL, parent_id uuid, code text NOT NULL, name text NOT NULL,
 description text, scope_status text NOT NULL DEFAULT 'PROPOSED',
 inventory_maturity text NOT NULL DEFAULT 'IDENTIFIED', criticality text NOT NULL DEFAULT 'MEDIUM',
 acceptance_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
 version bigint NOT NULL DEFAULT 1, UNIQUE(program_id,code), UNIQUE(id,program_id),
 FOREIGN KEY(domain_id,program_id) REFERENCES portfolio.domains(id,program_id),
 FOREIGN KEY(parent_id,program_id) REFERENCES portfolio.capabilities(id,program_id)
);
CREATE TABLE delivery.deliverables (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 workstream_id uuid, code text NOT NULL, name text NOT NULL, description text,
 layer text NOT NULL, deliverable_type text NOT NULL,
 scope_status text NOT NULL DEFAULT 'PROPOSED',
 planning_status text NOT NULL DEFAULT 'BACKLOG',
 execution_status text NOT NULL DEFAULT 'NOT_STARTED',
 delivery_stage text NOT NULL DEFAULT 'IDENTIFIED',
 health text NOT NULL DEFAULT 'UNKNOWN',
 owner_id uuid REFERENCES iam.users(id), forecast_date date, actual_date date,
 weight numeric(12,3) CHECK(weight IS NULL OR weight > 0),
 version bigint NOT NULL DEFAULT 1, updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(program_id,code), UNIQUE(id,program_id),
 FOREIGN KEY(workstream_id,program_id) REFERENCES portfolio.workstreams(id,program_id)
);
CREATE TABLE delivery.deliverable_capabilities (
 program_id uuid NOT NULL, deliverable_id uuid NOT NULL, capability_id uuid NOT NULL,
 contribution_type text NOT NULL DEFAULT 'REQUIRED',
 PRIMARY KEY(deliverable_id,capability_id),
 FOREIGN KEY(deliverable_id,program_id) REFERENCES delivery.deliverables(id,program_id),
 FOREIGN KEY(capability_id,program_id) REFERENCES portfolio.capabilities(id,program_id)
);
CREATE TABLE architecture.components (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 code text NOT NULL, name text NOT NULL, kind text NOT NULL, supplier text,
 UNIQUE(program_id,code), UNIQUE(id,program_id)
);
CREATE TABLE architecture.capability_components (
 program_id uuid NOT NULL, capability_id uuid NOT NULL, component_id uuid NOT NULL,
 relation_type text NOT NULL DEFAULT 'USES', PRIMARY KEY(capability_id,component_id),
 FOREIGN KEY(capability_id,program_id) REFERENCES portfolio.capabilities(id,program_id),
 FOREIGN KEY(component_id,program_id) REFERENCES architecture.components(id,program_id)
);
CREATE TABLE delivery.releases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 code text NOT NULL, name text NOT NULL, planned_date date, forecast_date date,
 actual_date date, status text NOT NULL DEFAULT 'PLANNED',
 UNIQUE(program_id,code), UNIQUE(id,program_id)
);
CREATE TABLE delivery.release_deliverables (
 program_id uuid NOT NULL, release_id uuid NOT NULL, deliverable_id uuid NOT NULL,
 required boolean NOT NULL DEFAULT true, PRIMARY KEY(release_id,deliverable_id),
 FOREIGN KEY(release_id,program_id) REFERENCES delivery.releases(id,program_id),
 FOREIGN KEY(deliverable_id,program_id) REFERENCES delivery.deliverables(id,program_id)
);
-- Nós registrados permitem integridade referencial de arestas; manter registro sincronizado
-- com a entidade canônica na mesma transação de aplicação.
CREATE TABLE portfolio.program_nodes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 entity_type text NOT NULL, entity_id uuid NOT NULL,
 UNIQUE(program_id,entity_type,entity_id), UNIQUE(id,program_id)
);
CREATE TABLE governance.dependencies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 source_node_id uuid NOT NULL, target_node_id uuid NOT NULL,
 dependency_type text NOT NULL, criticality text NOT NULL DEFAULT 'MEDIUM',
 status text NOT NULL DEFAULT 'OPEN', needed_by date,
 owner_id uuid REFERENCES iam.users(id), description text,
 CHECK(source_node_id <> target_node_id),
 FOREIGN KEY(source_node_id,program_id) REFERENCES portfolio.program_nodes(id,program_id),
 FOREIGN KEY(target_node_id,program_id) REFERENCES portfolio.program_nodes(id,program_id)
);
CREATE TABLE governance.raid_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 kind text NOT NULL, title text NOT NULL, severity text NOT NULL DEFAULT 'MEDIUM',
 status text NOT NULL DEFAULT 'OPEN', owner_id uuid REFERENCES iam.users(id),
 action_plan text, due_date date, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE governance.gate_definitions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), code text NOT NULL UNIQUE,
 name text NOT NULL, category text NOT NULL, version integer NOT NULL DEFAULT 1,
 blocking boolean NOT NULL DEFAULT true, applicability_rule jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE governance.gate_assessments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 subject_node_id uuid NOT NULL, gate_id uuid NOT NULL REFERENCES governance.gate_definitions(id),
 gate_version integer NOT NULL, result text NOT NULL DEFAULT 'PENDING',
 assessed_by uuid REFERENCES iam.users(id), assessed_at timestamptz,
 justification text, evidence_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
 FOREIGN KEY(subject_node_id,program_id) REFERENCES portfolio.program_nodes(id,program_id)
);
CREATE TABLE delivery.baselines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 version integer NOT NULL, status text NOT NULL DEFAULT 'DRAFT',
 approved_by uuid REFERENCES iam.users(id), approved_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(program_id,version)
);
CREATE TABLE delivery.baseline_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), baseline_id uuid NOT NULL REFERENCES delivery.baselines(id),
 subject_node_id uuid NOT NULL REFERENCES portfolio.program_nodes(id),
 frozen_payload jsonb NOT NULL, payload_hash text NOT NULL, UNIQUE(baseline_id,subject_node_id)
);
CREATE TABLE reporting.snapshots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 as_of timestamptz NOT NULL, formula_version text NOT NULL,
 payload jsonb NOT NULL, payload_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(program_id,as_of)
);
CREATE TABLE integration.external_references (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 subject_node_id uuid NOT NULL REFERENCES portfolio.program_nodes(id),
 connection_id text NOT NULL, external_id text NOT NULL, external_url text,
 external_updated_at timestamptz, last_synced_at timestamptz,
 UNIQUE(connection_id,external_id)
);
CREATE TABLE audit.audit_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), program_id uuid NOT NULL REFERENCES portfolio.programs(id),
 actor_id uuid REFERENCES iam.users(id), entity_type text NOT NULL, entity_id uuid NOT NULL,
 action text NOT NULL, before_data jsonb, after_data jsonb, reason text,
 correlation_id text, occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON delivery.deliverables(program_id,delivery_stage);
CREATE INDEX ON delivery.deliverables(program_id,workstream_id,forecast_date);
CREATE INDEX ON governance.dependencies(program_id,source_node_id);
CREATE INDEX ON governance.dependencies(program_id,target_node_id);
CREATE INDEX ON audit.audit_events(program_id,occurred_at DESC);
