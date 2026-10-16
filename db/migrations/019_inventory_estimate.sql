ALTER TABLE portfolio.programs ADD COLUMN owner_id uuid REFERENCES iam.users(id);
ALTER TABLE portfolio.programs ADD COLUMN inventory_estimate integer CHECK(inventory_estimate IS NULL OR inventory_estimate>0);
ALTER TABLE portfolio.programs ADD COLUMN inventory_estimate_as_of date;
ALTER TABLE portfolio.programs ADD COLUMN inventory_estimate_notes text;
ALTER TABLE portfolio.programs ADD CONSTRAINT estimate_source_required CHECK(inventory_estimate IS NULL OR (inventory_estimate_as_of IS NOT NULL AND length(trim(inventory_estimate_notes))>=3));
