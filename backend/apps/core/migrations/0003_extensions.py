"""PostgreSQL extensions the schema depends on (Stage 5 §6.3)."""

from django.contrib.postgres.operations import BtreeGistExtension
from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [("core", "0002_initial")]
    operations = [BtreeGistExtension()]
