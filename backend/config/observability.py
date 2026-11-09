"""Privacy filters for optional error reporting."""


def scrub_sentry_breadcrumb(crumb, hint):
    """Keep breadcrumb timing/type while removing potentially identifying data."""
    crumb = dict(crumb)
    crumb.pop("message", None)
    crumb.pop("data", None)
    crumb.pop("category", None)
    return crumb


def scrub_sentry_event(event, hint):
    """Send exception class and source location only; discard request/user data."""
    event = dict(event)
    for field in (
        "request", "user", "extra", "contexts", "tags", "transaction",
        "logentry", "spans", "threads",
    ):
        event.pop(field, None)
    event["message"] = "Application exception (details redacted)"

    for breadcrumb in event.get("breadcrumbs", {}).get("values", []):
        breadcrumb.pop("message", None)
        breadcrumb.pop("data", None)
        breadcrumb.pop("category", None)

    exception = event.get("exception", {}).get("values", [])
    for value in exception:
        value.pop("value", None)
        for frame in value.get("stacktrace", {}).get("frames", []):
            frame.pop("vars", None)

    return event
