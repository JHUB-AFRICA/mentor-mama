"""Root URLconf for MentorMAMA backend."""

from django.contrib import admin
from django.urls import include, path
from django.conf import settings
from django.conf.urls.static import static

from apps.identity import urls as identity_urls
from apps.core.views import AIStatusView, CommandDetailView, live_health, ready_health
from apps.mentorship import urls as mentorship_urls
from apps.institutions import urls as institution_urls
from apps.facilities import urls as facility_urls
from apps.placements import urls as placement_urls
from apps.directory_imports import urls as directory_import_urls
from apps.induction import urls as induction_urls
from apps.notifications import urls as notification_urls
from apps.assessments import urls as assessment_urls
from apps.safeguarding import urls as safeguarding_urls
from apps.analytics import urls as analytics_urls
from apps.learning import urls as learning_urls
from apps.content import urls as content_urls
from apps.assistant import urls as assistant_urls
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1 = [
    *identity_urls.urlpatterns,
    *placement_urls.urlpatterns,
    *directory_import_urls.urlpatterns,
    *induction_urls.urlpatterns,
    *mentorship_urls.urlpatterns,
    *institution_urls.urlpatterns,
    *facility_urls.urlpatterns,
    *notification_urls.urlpatterns,
    *assessment_urls.urlpatterns,
    *safeguarding_urls.urlpatterns,
    *analytics_urls.urlpatterns,
    *learning_urls.urlpatterns,
    *content_urls.urlpatterns,
    *assistant_urls.urlpatterns,
]

urlpatterns = [
    path("health/live", live_health, name="health-live"),
    path("health/ready", ready_health, name="health-ready"),
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
    path("api/v1/ai/status", AIStatusView.as_view(), name="ai-status"),
    path("api/v1/commands/<uuid:command_id>", CommandDetailView.as_view(), name="command-detail"),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
]

if settings.PROMETHEUS_METRICS_ENABLED:
    urlpatterns.insert(0, path("metrics", include("django_prometheus.urls")))

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
