import apps.core.models
import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('placements', '0005_rename_batch_actor_index'),
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='PlacementNote',
            fields=[
                ('id', models.UUIDField(default=apps.core.models.new_id, editable=False, primary_key=True, serialize=False)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('body', models.TextField()),
                ('author', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='placement_notes', to=settings.AUTH_USER_MODEL)),
                ('placement', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='notes', to='placements.placement')),
            ],
            options={
                'db_table': 'placements_note',
                'ordering': ['-created_at'],
            },
        ),
    ]
