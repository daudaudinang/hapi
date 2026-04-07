#!/usr/bin/env python3
"""
Score Calculator for review-plan skill.
LLM extracts persona scores → this script computes weighted total + verdict.

Usage:
  python score_calculator.py '<json_input>'

Input JSON format:
{
  "tier": "S" | "M" | "L",
  "personas": {
    "senior_dev": {"logic_flow": 8, "edge_cases": 6, "error_handling": 7, "naming": 9, "test_coverage": 7, "unit_test_quality": 8, "type_safety": 7, "code_duplication": 8},
    "architect":  {"coupling": 8, "pattern_consistency": 7, "scalability": 6, "integration_impact": 8, "backward_compat": 9, "api_contract": 7, "data_flow": 8},
    "security":   {"input_validation": 8, "auth": 9, "data_exposure": 7, "injection": 8, "secrets": 9},
    "ux_pm":      {"requirements": 8, "user_flow": 7, "error_ux": 6, "edge_case_ux": 7, "accessibility": 8, "performance_perception": 7}
  },
  "has_blocker": false
}

Note: Not all personas are required. Only include personas that were run (based on triage).
"""

import json
import sys

# Tier S: only senior_dev scores matter (4 core criteria)
TIER_S_CRITERIA = ["logic_flow", "edge_cases", "error_handling", "test_coverage"]

# Weights per persona (how much each persona contributes to final score)
PERSONA_WEIGHTS = {
    "senior_dev": 3,   # Correctness = highest priority
    "architect": 3,    # Architecture = equally critical
    "security": 2,     # Security = important but specialized
    "ux_pm": 1,        # UX = valuable but lower weight
}

THRESHOLD_FINDING = 7  # Score < 7 = must flag

def calculate(data: dict) -> dict:
    tier = data.get("tier", "M").upper()
    personas = data.get("personas", {})
    has_blocker = data.get("has_blocker", False)

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

    # Calculate weighted total
    weighted_sum = 0
    weight_sum = 0
    for persona_name, result in persona_results.items():
        weight = PERSONA_WEIGHTS.get(persona_name, 1)
        weighted_sum += result["avg"] * weight
        weight_sum += weight

    weighted_avg = round(weighted_sum / weight_sum, 1) if weight_sum > 0 else 0

    # Determine verdict
    if has_blocker:
        verdict = "CẦN XEM LẠI"
        verdict_emoji = "❌"
    elif weighted_avg >= 9.0:
        verdict = "PASS"
        verdict_emoji = "✅"
    elif weighted_avg >= 6.0:
        verdict = "CẦN BỔ SUNG"
        verdict_emoji = "⚠️"
    else:
        verdict = "CẦN XEM LẠI"
        verdict_emoji = "❌"

    # Auto-downgrade: any high-weight persona with avg <= 5
    for persona_name in ["senior_dev", "architect"]:
        if persona_name in persona_results:
            if persona_results[persona_name]["avg"] <= 5.0:
                verdict = "CẦN XEM LẠI"
                verdict_emoji = "❌"

    # Security override: any security score < 5 = auto-downgrade
    if "security" in persona_results:
        if persona_results["security"]["min_score"] < 5:
            verdict = "CẦN XEM LẠI"
            verdict_emoji = "❌"

    return {
        "tier": tier,
        "weighted_avg": weighted_avg,
        "verdict": verdict,
        "verdict_emoji": verdict_emoji,
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
