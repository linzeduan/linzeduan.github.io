import data from "../content/questions.json";
import plan from "../content/plan.json";
import type { Question } from "../domain/types";
export const questions = data as Question[];
export const questionMap = new Map(questions.map((q) => [q.questionId, q]));
export const recommendation = plan;
export function getQuestion(id: string): Question {
  const question = questionMap.get(id);
  if (!question) throw new Error("没有找到这道题。");
  return question;
}
