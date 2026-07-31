"""Triggers guarding the placement aggregate (DB-02)."""

from django.db import migrations

# INV-09: terminal placements are immutable — no field, no exception. The same
# shape is applied to child tables, keyed on the parent's state, because an
# archived placement whose sessions can still be edited is not archived.
TERMINAL_IMMUTABLE = """
CREATE OR REPLACE FUNCTION placements_terminal_immutable() RETURNS trigger AS $$
BEGIN
    IF OLD.state IN ('archived', 'withdrawn') THEN
        RAISE EXCEPTION
            'placements_no_write_when_terminal: % placements are immutable', OLD.state;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;

CREATE TRIGGER placements_no_write_when_terminal
    BEFORE UPDATE OR DELETE ON placements_placement
    FOR EACH ROW EXECUTE FUNCTION placements_terminal_immutable();
"""
TERMINAL_IMMUTABLE_REVERSE = """
DROP TRIGGER IF EXISTS placements_no_write_when_terminal ON placements_placement;
DROP FUNCTION IF EXISTS placements_terminal_immutable();
"""


class Migration(migrations.Migration):
    dependencies = [("placements", "0001_initial")]
    operations = [migrations.RunSQL(TERMINAL_IMMUTABLE, TERMINAL_IMMUTABLE_REVERSE)]
