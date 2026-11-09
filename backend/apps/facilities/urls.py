from django.urls import path

from apps.facilities import views

urlpatterns = [
    path("facilities", views.FacilityListView.as_view(), name="facility-list"),
    path("facilities/<uuid:facility_id>", views.FacilityDetailView.as_view(), name="facility-detail"),
]
