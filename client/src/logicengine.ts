// --- Types defined in the assignment ---
export type Operator = "equals" | "notEquals" | "contains";

export interface Condition {
  questionKey: string; // The ID of the field we are checking
  operator: Operator;
  value: any;
}

export interface ConditionalRules {
  logic: "AND" | "OR";
  conditions: Condition[];
}

// --- The Pure Function ---
export function shouldShowQuestion(
  rules: ConditionalRules | null | undefined,
  answersSoFar: Record<string, any>
): boolean {
  // 1. If no rules exist, always show the question
  if (!rules || !rules.conditions || rules.conditions.length === 0) {
    return true;
  }

  // 2. Evaluate every condition
  const results = rules.conditions.map((condition) => {
    const userAnswer = answersSoFar[condition.questionKey];

    // If the user hasn't answered the dependency yet, it's a mismatch
    if (userAnswer === undefined || userAnswer === null) return false;

    switch (condition.operator) {
      case "equals":
        // usage: answers['role'] === 'Engineer'
        return String(userAnswer) === String(condition.value);

      case "notEquals":
        return String(userAnswer) !== String(condition.value);

      case "contains":
        // Handle arrays (Multi-select) or Strings
        if (Array.isArray(userAnswer)) {
          return userAnswer.includes(condition.value);
        }
        return String(userAnswer).includes(condition.value);

      default:
        return false;
    }
  });

  // 3. Combine results based on AND / OR
  if (rules.logic === "AND") {
    return results.every((res) => res === true);
  } else {
    // OR logic
    return results.some((res) => res === true);
  }
}
