"""Priority bounds, closure timestamp and register indexes.

Both data steps are forward-only repairs of existing rows, never deletions:

* `backfill_closed_at` gives already-closed recommendations a closure date so
  historical follow-up reports can tell what was open during a past period.
  `updated_at` is the best available proxy, and is only used for rows that
  closed before this field existed.
* `clamp_priority_scores` pulls any out-of-range score into 0..100 *before*
  the CHECK constraint is added. Without this, deploying against a database
  that already contains an out-of-range score would abort the migration.
"""
import django.core.validators
from django.db import migrations, models


def backfill_closed_at(apps, schema_editor):
    Recommendation = apps.get_model("audits", "Recommendation")
    Recommendation.objects.filter(status="closed", closed_at__isnull=True).update(
        closed_at=models.F("updated_at")
    )


def clamp_priority_scores(apps, schema_editor):
    Recommendation = apps.get_model("audits", "Recommendation")
    Recommendation.objects.filter(priority_score__lt=0).update(priority_score=0)
    Recommendation.objects.filter(priority_score__gt=100).update(priority_score=100)


def noop(apps, schema_editor):
    """Reversing leaves the repaired data in place; nothing to undo."""


class Migration(migrations.Migration):

    dependencies = [
        ('audits', '0002_alter_recommendation_status'),
    ]

    operations = [
        migrations.AddField(
            model_name='recommendation',
            name='closed_at',
            field=models.DateTimeField(blank=True, db_index=True, null=True),
        ),
        migrations.RunPython(backfill_closed_at, noop),
        migrations.RunPython(clamp_priority_scores, noop),
        migrations.AlterField(
            model_name='recommendation',
            name='priority_score',
            field=models.IntegerField(default=0, help_text='Auditor-set follow-up priority, 0-100. AI may suggest, never set.', validators=[django.core.validators.MinValueValidator(0), django.core.validators.MaxValueValidator(100)]),
        ),
        migrations.AddIndex(
            model_name='recommendation',
            index=models.Index(fields=['report', 'status'], name='rec_report_status_idx'),
        ),
        migrations.AddIndex(
            model_name='recommendation',
            index=models.Index(fields=['-priority_score', '-created_at'], name='rec_priority_created_idx'),
        ),
        migrations.AddConstraint(
            model_name='recommendation',
            constraint=models.CheckConstraint(condition=models.Q(('priority_score__gte', 0), ('priority_score__lte', 100)), name='recommendation_priority_score_0_100'),
        ),
    ]
