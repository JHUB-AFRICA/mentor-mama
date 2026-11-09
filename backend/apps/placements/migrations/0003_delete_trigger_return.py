from django.db import migrations


TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION placements_terminal_immutable() RETURNS trigger AS $$
BEGIN
    IF OLD.state IN ('archived', 'withdrawn') THEN
        RAISE EXCEPTION
            'placements_no_write_when_terminal: % placements are immutable', OLD.state;
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END $$ LANGUAGE plpgsql;
"""


class Migration(migrations.Migration):
    dependencies = [("placements", "0002_constraints")]
    operations = [migrations.RunSQL(TRIGGER_SQL)]
