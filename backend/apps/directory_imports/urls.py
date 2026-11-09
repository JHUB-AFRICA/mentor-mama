from django.urls import path

from apps.directory_imports.views import DirectoryImportView

urlpatterns = [
    path("directory-imports/<str:kind>/<str:stage>", DirectoryImportView.as_view(), name="directory-import"),
]
