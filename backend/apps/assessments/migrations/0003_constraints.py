"""Immutability of submitted feedback and assessments (INV-14, ADR 0007)."""

from django.db import migrations

IMMUTABLE = """
CREATE OR REPLACE FUNCTION assessments_reject_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION
        'assessments_immutable: % is append-only — create a revision instead', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER assessments_immutable
    BEFORE UPDATE OR DELETE ON assessments_feedback_confidential
    FOR EACH ROW EXECUTE FUNCTION assessments_reject_mutation();

CREATE TRIGGER assessments_immutable_anonymous
    BEFORE UPDATE OR DELETE ON assessments_feedback_anonymous
    FOR EACH ROW EXECUTE FUNCTION assessments_reject_mutation();

CREATE TRIGGER assessments_immutable_assessment
    BEFORE UPDATE OR DELETE ON assessments_assessment
    FOR EACH ROW EXECUTE FUNCTION assessments_reject_mutation();

CREATE TRIGGER assessments_immutable_response
    BEFORE UPDATE OR DELETE ON assessments_response
    FOR EACH ROW EXECUTE FUNCTION assessments_reject_mutation();
"""
IMMUTABLE_REVERSE = """
DROP TRIGGER IF EXISTS assessments_immutable ON assessments_feedback_confidential;
DROP TRIGGER IF EXISTS assessments_immutable_anonymous ON assessments_feedback_anonymous;
DROP TRIGGER IF EXISTS assessments_immutable_assessment ON assessments_assessment;
DROP TRIGGER IF EXISTS assessments_immutable_response ON assessments_response;
DROP FUNCTION IF EXISTS assessments_reject_mutation();
"""


class Migration(migrations.Migration):
    dependencies = [("assessments", "0002_initial")]
    operations = [migrations.RunSQL(IMMUTABLE, IMMUTABLE_REVERSE)]
