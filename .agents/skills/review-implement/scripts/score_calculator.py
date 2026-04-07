#!/usr/bin/env python3
"""
Score Calculator for review-implement skill.
LLM extracts persona scores → this script computes weighted total + verdict.

Usage:
  python score_calculator.py '<json_input>'

Input JSON format:
{
  "personas": {
    "senior_dev": {"logic_correctness": 8, "edge_cases": 6, "error_handling": 7, "naming": 9, "test_coverage": 7, "unit_test_quality": 8, "type_safety": 7, "code_duplication": 8},
    "architect":  {"coupling": 8, "pattern_consistency": 7, "scalability": 6, "integration_impact": 8, "backward_compat": 9, "api_contract": 7, "data_flow": 8},
    "security":   {"input_validation": 8, "auth": 9, "data_exposure": 7, "injection": 8, "secrets": 9},
    "ux_pm":      {"requirements": 8, "user_flow": 7, "error_ux": 6, "edge_case_ux": 7, "accessibility": 8, "performance_perception": 7}
  },
  "boundary_compliance": 10,
  "traceability_ac": 8,
  "has_critical": false
}

Note: boundary_compliance and traceability_ac are top-level scores from PHASE 1.
"""

import json
import sys

# Weights for top-level criteria (from original review-implement)
TOP_LEVEL_WEIGHTS = {
    "boundary_compliance": 4,  # Guardrails = HIGHEST priority
    "traceability_ac": 3,      # AC verification = high
}

# Weights per persona
PERSONA_WEIGHTS = {
    "senior_dev": 3,   # Correctness
    "architect": 2,    # Architecture
    "security": 2,     # Security
    "ux_pm": 1,        # UX
}

THRESHOLD_FINDING = 7


def calculate(data: dict) -> dict:
    personas = data.get("personas", {})
    boundary = data.get("boundary_compliance", 10)
    traceability = data.get("traceability_ac", 10)
    has_critical = data.get("has_critical", False)

    # Calculate per-persona averages
    persona_results = {}
    all_findings = []

    for persona_name, scores in personas.items():
        values = list(scores.values())
        avg = sum(values) / len(values) if values else 0
        findings = [
            {"criterion": k, "score": v, "persona": persona_name}
            for k, v in scores.items() if v < THRESHOLD_FINDING
        ]
        persona_results[persona_name] = {
            "avg": round(avg, 1),
            "criteria_count": len(values),
            "findings_count": len(findings),
            "min_score": min(values) if values else 0,
        }
        all_findings.extend(findings)

    # Calculate weighted score (original formula preserved)
    # Top-level: boundary(×4) + traceability(×3) = max 70 pts
    top_score = (boundary * TOP_LEVEL_WEIGHTS["boundary_compliance"] +
                 traceability * TOP_LEVEL_WEIGHTS["traceability_ac"])
    top_max = sum(10 * w for w in TOP_LEVEL_WEIGHTS.values())

    # Persona scores: weighted average mapped to remaining points
    persona_weighted_sum = 0
    persona_weight_total = 0
    for persona_name, result in persona_results.items():
        weight = PERSONA_WEIGHTS.get(persona_name, 1)
        persona_weighted_sum += result["avg"] * weight
        persona_weight_total += weight

    persona_avg = (persona_weighted_sum / persona_weight_total
                   if persona_weight_total > 0 else 0)

    # Combined: top-level (70 pts max) + persona (60 pts max) = 130 pts max
    persona_score = persona_avg * 6  # Scale to 60 pts
    total_score = round(top_score + persona_score, 1)
    max_score = top_max + 60  # 130
    percentage = round(total_score / max_score * 100, 1)

    # Determine verdict
    if has_critical or boundary <= 5:
        verdict = "CHANGES REQUESTED"
        verdict_emoji = "❌"
    elif percentage >= 90:
        verdict = "APPROVED"
        verdict_emoji = "✅"
    elif percentage >= 60:
        verdict = "APPROVED WITH NOTES"
        verdict_emoji = "⚠️"
    else:
        verdict = "CHANGES REQUESTED"
        verdict_emoji = "❌"

    # Security override
    if "security" in persona_results:
        if persona_results["security"]["min_score"] < 5:
            verdict = "CHANGES REQUESTED"
            verdict_emoji = "❌"

    return {
        "total_score": total_score,
        "max_score": max_score,
        "percentage": percentage,
        "verdict": verdict,
        "verdict_emoji": verdict_emoji,
        "boundary_compliance": boundary,
        "traceability_ac": traceability,
        "persona_avg": round(persona_avg, 1),
        "personas_run": list(persona_results.keys()),
        "persona_results": persona_results,
        "total_findings": len(all_findings),
        "critical_findings": [f for f in all_findings if f["score"] <= 4],
        "findings_below_threshold": all_findings,
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python score_calculator.py '<json_input>'")
        sys.exit(1)

    try:
        data = json.loads(sys.argv[1])
    except json.JSONDecodeError as e:
        print(json.dumps({"error": f"Invalid JSON: {e}"}))
        sys.exit(1)

    result = calculate(data)
    print(json.dumps(result, ensure_ascii=False, indent=2))
