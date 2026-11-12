from django.urls import path

from apps.platform import enquiry_views as enq
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
    path("public/enquiries", enq.PublicEnquiryView.as_view()),
    path("platform/enquiries", enq.EnquiriesView.as_view()),
    path("platform/enquiries/<uuid:enquiry_id>", enq.EnquiryDetailView.as_view()),
    path("platform/enquiries/<uuid:enquiry_id>/assign", enq.EnquiryAssignView.as_view()),
    path("platform/enquiries/<uuid:enquiry_id>/status", enq.EnquiryStatusView.as_view()),
    path("platform/enquiries/<uuid:enquiry_id>/priority", enq.EnquiryPriorityView.as_view()),
    path("platform/enquiries/<uuid:enquiry_id>/notes", enq.EnquiryNoteView.as_view()),
    path("platform/enquiries/<uuid:enquiry_id>/reply", enq.EnquiryReplyView.as_view()),
    path("platform/enquiries/<uuid:enquiry_id>/email/resend", enq.EnquiryEmailResendView.as_view()),
    path("platform/enquiries/<uuid:enquiry_id>/convert", enq.EnquiryConvertView.as_view()),
    path("platform/activity", views.ActivityView.as_view()),
]
