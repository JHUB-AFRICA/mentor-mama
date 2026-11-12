from django.urls import path

from apps.institutions import views

urlpatterns = [
    path("institutions", views.InstitutionListView.as_view(), name="institution-list"),
    path("institutions/<uuid:institution_id>/logo", views.InstitutionLogoView.as_view(), name="institution-logo"),
    path("institutions/<uuid:institution_id>", views.InstitutionDetailView.as_view(), name="institution-detail"),
    path("cohorts", views.CohortListView.as_view(), name="cohort-list"),
    path("cohorts/<uuid:cohort_id>", views.CohortDetailView.as_view(), name="cohort-detail"),
    path("institution/students", views.InstitutionStudentListView.as_view(), name="institution-student-list"),
    path("cohorts/<uuid:cohort_id>/enrolments", views.CohortEnrolmentView.as_view(), name="cohort-enrolment"),
    path("cohorts/<uuid:cohort_id>/bulk-enrolments", views.CohortBulkEnrolmentView.as_view(), name="cohort-bulk-enrolment"),
    path("cohorts/<uuid:cohort_id>/memberships/remove", views.CohortMembershipRemovalView.as_view(), name="cohort-membership-remove"),
    path("cohorts/<uuid:cohort_id>/students", views.CohortStudentListView.as_view(), name="cohort-students"),
    path("student/profile", views.StudentProfileView.as_view(), name="student-profile"),
]
