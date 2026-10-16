ALTER TABLE governance.gate_assessments ADD COLUMN mitigation_plan text;
ALTER TABLE governance.gate_assessments ADD COLUMN decision_reference text;
ALTER TABLE governance.gate_assessments ADD CONSTRAINT exception_context_required CHECK(result<>'EXCEPTION_APPROVED' OR (mitigation_plan IS NOT NULL AND length(trim(mitigation_plan))>=3 AND decision_reference IS NOT NULL AND length(trim(decision_reference))>=3)) NOT VALID;
