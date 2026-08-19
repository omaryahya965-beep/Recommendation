from apps.ai.services.common import run_job

# Placeholder for a future Celery task: process_ai_job.delay(job_id)
# Development runs jobs inline via run_job().


def process_ai_job(job_id: int):
    """Reserved for Celery. Inline processing uses run_job() from views."""
    raise NotImplementedError("Use apps.ai.services.common.run_job for inline jobs.")
