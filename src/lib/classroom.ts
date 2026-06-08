export type ClassroomCreatePolicy = "all_members" | "admins_only";
export type CommunityRole = "owner" | "admin" | "moderator" | "member";

/** Completed lessons / total, rounded, clamped 0..100. */
export function courseProgressPercent(completed: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((completed / total) * 100));
}

/** May this role create a course under the community's policy? null = not a member. */
export function canCreateCourse(
  policy: ClassroomCreatePolicy,
  role: CommunityRole | null,
): boolean {
  if (role === null) return false;
  if (policy === "admins_only") return role === "owner" || role === "admin";
  return true; // all_members: any active member
}

export type ExamQuestion = {
  id: string;
  prompt: string;
  type: "single" | "boolean";
  options: string[];
  correctIndex: number;
};
export type ExamDefinition = ExamQuestion[];
export type PublicExamQuestion = Omit<ExamQuestion, "correctIndex">;
export type ExamAnswer = { questionId: string; selectedIndex: number };

/** Grade objective answers against the key. Missing/out-of-range answers are wrong. */
export function gradeExam(
  questions: ExamQuestion[],
  answers: ExamAnswer[],
): { score: number; correctCount: number; wrongQuestionIds: string[] } {
  if (questions.length === 0) {
    return { score: 0, correctCount: 0, wrongQuestionIds: [] };
  }
  const picked = new Map(answers.map((a) => [a.questionId, a.selectedIndex]));
  const wrongQuestionIds: string[] = [];
  let correctCount = 0;
  for (const q of questions) {
    if (picked.get(q.id) === q.correctIndex) correctCount++;
    else wrongQuestionIds.push(q.id);
  }
  return {
    score: Math.round((correctCount / questions.length) * 100),
    correctCount,
    wrongQuestionIds,
  };
}

/** Did a score clear the pass threshold (inclusive)? */
export function examPassed(score: number, threshold: number): boolean {
  return score >= threshold;
}

/** Drop the answer key so questions are safe to send to the browser. */
export function stripAnswerKey(questions: ExamQuestion[]): PublicExamQuestion[] {
  return questions.map(({ correctIndex: _correctIndex, ...rest }) => rest);
}

/** Course-pass is completion-derived: every lesson complete, and at least one lesson. */
export function coursePassed(completed: number, total: number): boolean {
  return total > 0 && completed >= total;
}

/** Convert a YouTube watch/youtu.be URL to an embed URL, or null if not YouTube/malformed. */
export function youtubeEmbedUrl(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.hostname === "youtu.be") {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    if (u.hostname.endsWith("youtube.com")) {
      const id = u.searchParams.get("v");
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
    return null;
  } catch {
    return null;
  }
}
