"""Root URLconf for MentorMAMA backend."""

from django.contrib import admin
from django.urls import include, path

from apps.identity import urls as identity_urls
from apps.mentorship import urls as mentorship_urls
from apps.placements import urls as placement_urls
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

api_v1 = [
    *identity_urls.urlpatterns,
    *placement_urls.urlpatterns,
    *mentorship_urls.urlpatterns,
]

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/v1/", include(api_v1)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path(
        "api/docs/",
        SpectacularSwaggerView.as_view(url_name="schema"),
        name="swagger-ui",
    ),
]
