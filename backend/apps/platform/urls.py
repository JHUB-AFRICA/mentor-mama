from django.urls import path

from apps.platform import views

urlpatterns = [
    path("platform/overview", views.OverviewView.as_view()),
    path("platform/status", views.SystemStatusView.as_view()),
    path("platform/programmes", views.ProgrammesView.as_view()),
    path("platform/programmes/<uuid:programme_id>/admins", views.ProgrammeAdminInviteView.as_view()),
    path("platform/platform-admins", views.PlatformAdminInviteView.as_view()),
    path("platform/accounts", views.AccountsView.as_view()),
    path("platform/accounts/<uuid:user_id>/status", views.AccountStatusView.as_view()),
    path("platform/accounts/<uuid:user_id>/sessions/revoke", views.AccountSessionsView.as_view()),
    path("platform/accounts/<uuid:user_id>/invitation/resend", views.AccountInvitationResendView.as_view()),
    path("platform/support-requests", views.SupportRequestsView.as_view()),
    path("platform/support-requests/<uuid:request_id>/resolve", views.SupportRequestResolveView.as_view()),
    path("platform/activity", views.ActivityView.as_view()),
]
