"""Django authentication adapters for the domain account status model."""

from django.contrib.auth.backends import ModelBackend

from apps.identity.models import Status


class StatusModelBackend(ModelBackend):
    """Keep account-status policy out of the ORM model."""

    def user_can_authenticate(self, user):
        return user.status == Status.ACTIVE
