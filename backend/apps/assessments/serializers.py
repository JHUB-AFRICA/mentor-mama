from rest_framework import serializers


class FeedbackResponseSerializer(serializers.Serializer):
    question_code = serializers.RegexField(r"^[a-zA-Z0-9_.-]{1,60}$")
    scale = serializers.ChoiceField(choices=("likert_1_5", "score_0_100", "yes_no"))
    value_numeric = serializers.DecimalField(max_digits=5, decimal_places=2, required=False, allow_null=True)
    value_boolean = serializers.BooleanField(required=False, allow_null=True)

    def validate(self, attrs):
        scale = attrs["scale"]
        numeric = attrs.get("value_numeric")
        boolean = attrs.get("value_boolean")
        if scale == "likert_1_5" and (numeric is None or not 1 <= numeric <= 5 or boolean is not None):
            raise serializers.ValidationError("Likert responses must be a numeric value from 1 to 5.")
        if scale == "score_0_100" and (numeric is None or not 0 <= numeric <= 100 or boolean is not None):
            raise serializers.ValidationError("Score responses must be a numeric value from 0 to 100.")
        if scale == "yes_no" and (boolean is None or numeric is not None):
            raise serializers.ValidationError("Yes/no responses must contain a boolean value.")
        return attrs


class FinalAssessmentSerializer(serializers.Serializer):
    confidence_score = serializers.IntegerField(min_value=0, max_value=100)
    overall_experience = serializers.IntegerField(min_value=1, max_value=5)


class BaselineAssessmentSerializer(serializers.Serializer):
    confidence_score = serializers.IntegerField(min_value=0, max_value=100)


class FeedbackSerializer(serializers.Serializer):
    mode = serializers.ChoiceField(choices=("confidential", "anonymous"), default="confidential")
    comments = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None)
    responses = FeedbackResponseSerializer(many=True, required=False, default=list, max_length=30)

    def validate_responses(self, value):
        codes = [item["question_code"] for item in value]
        if len(codes) != len(set(codes)):
            raise serializers.ValidationError("Each question may be answered once.")
        return value


#: Structured student feedback (concept note, Appendix B). question_code -> scale.
CONFIDENTIAL_QUESTIONS = {
    "orientation": "likert_1_5",
    "knows_mentor": "yes_no",
    "mentor_availability": "likert_1_5",
    "constructive_feedback": "likert_1_5",
    "confidence_this_week": "likert_1_5",
    "respectful_environment": "likert_1_5",
}


class ConfidentialFeedbackSerializer(FeedbackSerializer):
    unresolved_concern = serializers.BooleanField(required=False, default=False)
    improvement = serializers.CharField(required=False, allow_blank=True, allow_null=True, default=None, max_length=1000)

    def validate(self, attrs):
        if attrs.get("mode") != "confidential":
            return attrs  # the view redirects anonymous submissions to the privacy-protected endpoint
        for item in attrs.get("responses", []):
            expected = CONFIDENTIAL_QUESTIONS.get(item["question_code"])
            if expected is None:
                raise serializers.ValidationError({"responses": f"Unknown feedback question: {item['question_code']}."})
            if item["scale"] != expected:
                raise serializers.ValidationError({"responses": f"{item['question_code']} must use the {expected} scale."})
        comments = (attrs.get("comments") or "").strip()
        if attrs.get("unresolved_concern") and len(comments) < 5:
            raise serializers.ValidationError({"comments": "Briefly describe the concern that needs follow-up."})
        if not (attrs.get("responses") or comments or (attrs.get("improvement") or "").strip()):
            raise serializers.ValidationError("Add at least one rating or comment before submitting.")
        return attrs


class AnonymousFeedbackSerializer(FeedbackSerializer):
    placement_id = serializers.UUIDField(write_only=True)
    mode = serializers.ChoiceField(choices=("anonymous",), default="anonymous")

    def validate(self, attrs):
        attrs = super().validate(attrs)
        if attrs.get("comments"):
            raise serializers.ValidationError({"comments": "Anonymous feedback accepts ratings only."})
        expected = {"support", "learning_opportunities", "safety_to_speak_up"}
        responses = attrs.get("responses", [])
        if {item["question_code"] for item in responses} != expected or any(
            item["scale"] != "likert_1_5" for item in responses
        ):
            raise serializers.ValidationError({"responses": "Provide one 1–5 rating for each anonymous feedback statement."})
        return attrs
