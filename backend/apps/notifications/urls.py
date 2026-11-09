from django.urls import path

from apps.notifications import views

urlpatterns = [
    path("notification-preferences", views.NotificationPreferenceView.as_view(), name="notification-preferences"),
    path("me/notifications", views.NotificationListView.as_view(), name="notifications"),
    path("me/notifications/<uuid:notification_id>/read", views.NotificationReadView.as_view(), name="notification-read"),
    path("me/notifications/read-all", views.NotificationReadAllView.as_view(), name="notifications-read-all"),
    path("webhooks/mailtrap", views.MailtrapWebhookView.as_view(), name="mailtrap-webhook"),
]
