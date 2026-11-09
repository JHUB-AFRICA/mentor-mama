from rest_framework import serializers


class DirectoryImportSerializer(serializers.Serializer):
    file = serializers.FileField()
    facility_id = serializers.UUIDField(required=False)
    preview_token = serializers.CharField(required=False, allow_blank=False, max_length=4096)
    confirm_warnings = serializers.BooleanField(required=False, default=False)

    def validate_file(self, uploaded_file):
        if uploaded_file.size > 2 * 1024 * 1024:
            raise serializers.ValidationError("Choose a CSV file that is 2 MB or smaller.")
        if not uploaded_file.name.lower().endswith(".csv"):
            raise serializers.ValidationError("Choose a .csv file.")
        return uploaded_file
