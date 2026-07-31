"""Raw-SQL objects Django cannot express (DB-02).

Every one of these enforces a rule that would otherwise depend on the
application remembering. All are reversible.
"""

from django.db import migrations

# WFR-031 / ADR 0007: audit entries are append-only.
#
# In production the application connects as a role that is not the table owner,
# and `REVOKE UPDATE, DELETE` is the real control. Locally and in CI the app IS
# the owner, and a grant cannot be revoked from an owner — so the trigger below
# is what makes the guarantee testable in every environment.
AUDIT_IMMUTABLE = """
CREATE OR REPLACE FUNCTION core_reject_mutation() RETURNS trigger AS $$
BEGIN
    RAISE EXCEPTION 'audit_no_mutation: % is append-only', TG_TABLE_NAME;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER audit_no_mutation
    BEFORE UPDATE OR DELETE ON core_audit_entry
    FOR EACH ROW EXECUTE FUNCTION core_reject_mutation();
"""
AUDIT_IMMUTABLE_REVERSE = """
DROP TRIGGER IF EXISTS audit_no_mutation ON core_audit_entry;
DROP FUNCTION IF EXISTS core_reject_mutation();
"""

# WFR-025 / EV-01: escalation content leaking into a notification payload is the
# highest-consequence mistake available in this codebase. Make it a runtime
# error at the point of insert rather than a code-review responsibility.
OUTBOX_PAYLOAD_GUARD = """
CREATE OR REPLACE FUNCTION core_outbox_reject_restricted() RETURNS trigger AS $$
BEGIN
    IF NEW.payload ?| ARRAY['description', 'action_taken', 'finding', 'comments',
                            'feedback_given', 'what_was_covered'] THEN
        RAISE EXCEPTION
            'outbox payload may not carry restricted content (WFR-025): %', NEW.event_type;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER core_outbox_payload_guard
    BEFORE INSERT ON core_outbox_event
    FOR EACH ROW EXECUTE FUNCTION core_outbox_reject_restricted();
"""
OUTBOX_PAYLOAD_GUARD_REVERSE = """
DROP TRIGGER IF EXISTS core_outbox_payload_guard ON core_outbox_event;
DROP FUNCTION IF EXISTS core_outbox_reject_restricted();
"""


class Migration(migrations.Migration):
    dependencies = [("core", "0003_extensions")]
    operations = [
        migrations.RunSQL(AUDIT_IMMUTABLE, AUDIT_IMMUTABLE_REVERSE),
        migrations.RunSQL(OUTBOX_PAYLOAD_GUARD, OUTBOX_PAYLOAD_GUARD_REVERSE),
    ]
