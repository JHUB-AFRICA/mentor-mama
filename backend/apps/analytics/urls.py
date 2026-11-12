from django.urls import path

from apps.analytics import views

urlpatterns = [
    path("dashboard", views.DashboardView.as_view(), name="dashboard"),
    path("reports/insights", views.ReportInsightsView.as_view(), name="report-insights"),
    path("reports/training", views.TrainingReportView.as_view(), name="report-training"),
    path("reports/overview", views.ReportOverviewView.as_view(), name="report-overview"),
    path("mentors/activity", views.MentorActivityView.as_view(), name="mentor-activity"),
    path("dashboard/interruptions", views.InterruptionDashboardView.as_view(), name="dashboard-interruptions"),
    path("dashboard/feedback", views.FeedbackDashboardView.as_view(), name="dashboard-feedback"),
    path("reports/anonymous-feedback", views.AnonymousFeedbackReportView.as_view(), name="anonymous-feedback-report"),
    path("placements/<uuid:placement_id>/progress", views.PlacementProgressView.as_view(), name="placement-progress"),
    path("cohorts/<uuid:cohort_id>/progress", views.CohortProgressView.as_view(), name="cohort-progress"),
    path("exports", views.ExportListView.as_view(), name="export-list"),
    path("exports/<uuid:export_id>", views.ExportDetailView.as_view(), name="export-detail"),
    path("exports/<uuid:export_id>/download", views.ExportDownloadView.as_view(), name="export-download"),
]
