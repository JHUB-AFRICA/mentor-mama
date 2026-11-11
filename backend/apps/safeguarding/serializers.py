from rest_framework import serializers

from apps.safeguarding.models import ResolutionOutcome, ReviewRoute, Severity


class RaiseEscalationSerializer(serializers.Serializer):
    placement_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    facility_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    category = serializers.CharField(max_length=60)
    severity = serializers.ChoiceField(choices=Severity.choices)
    description = serializers.CharField(min_length=10)
    related_escalation_id = serializers.UUIDField(required=False, allow_null=True, default=None)
    routed_to = serializers.ChoiceField(choices=ReviewRoute.choices)


class ReviewerSerializer(serializers.Serializer):
    reviewer_id = serializers.UUIDField()


class FindingSerializer(serializers.Serializer):
    finding = serializers.CharField(min_length=1)


class ActionSerializer(serializers.Serializer):
    action_taken = serializers.CharField(min_length=1)
    resolution_outcome = serializers.ChoiceField(choices=ResolutionOutcome.choices, required=False, allow_null=True, default=None)
    referral_note = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)


class CloseSerializer(serializers.Serializer):
    closure_date = serializers.DateField()


class RereviewSerializer(serializers.Serializer):
    reason = serializers.CharField(min_length=10, max_length=2000)
