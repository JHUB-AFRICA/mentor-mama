from rest_framework import serializers

from apps.assistant.service import MAX_HISTORY_TURNS, MAX_MESSAGE_CHARS


class TurnSerializer(serializers.Serializer):
    role = serializers.ChoiceField(choices=["user", "assistant"])
    content = serializers.CharField(max_length=2_000, trim_whitespace=True)


class ChatSerializer(serializers.Serializer):
    message = serializers.CharField(max_length=MAX_MESSAGE_CHARS, trim_whitespace=True)
    history = TurnSerializer(many=True, required=False, max_length=MAX_HISTORY_TURNS * 2)
    page = serializers.CharField(max_length=200, required=False, allow_blank=True, default="")
