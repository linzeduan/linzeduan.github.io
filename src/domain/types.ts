export type Category =
  | "self"
  | "interests"
  | "food"
  | "daily"
  | "friendship"
  | "emotions"
  | "future"
  | "intimacy";
export type Question = {
  questionId: string;
  originalNumber: number;
  content: string;
  category: Category;
  difficulty: 1 | 2 | 3;
  sensitivity: "low" | "medium" | "high";
  recommendedStage: "initial" | "familiar" | "deep";
  enabled: boolean;
};
export type Profile = "a" | "b";
export type Entry = {
  id: string;
  questionId: string;
  owner: Profile;
  text: string;
  note: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  status: "draft" | "submitted";
  roundId?: string;
};
export type Submission = {
  owner: Profile;
  text: string;
  submittedAt: string;
  withdrawn: boolean;
};
export type Comment = {
  id: string;
  owner: Profile;
  text: string;
  createdAt: string;
  replyTo?: string;
};
export type Round = {
  id: string;
  questionId: string;
  date: string;
  submissions: Partial<Record<Profile, Submission>>;
  comments: Comment[];
  closed: boolean;
};
export type SharedView = {
  roundId: string;
  questionId: string;
  state:
    | "draft"
    | "waiting"
    | "partner-ready"
    | "unlocked"
    | "withdrawn"
    | "dissolved"
    | "unavailable";
  own?: Submission;
  partner?: Submission;
  comments: Comment[];
  date?: string;
  kind?: "daily" | "free";
  needsAcceptance?: boolean;
  awaitingAcceptance?: boolean;
};
export type DemoSnapshot = {
  profile: Profile;
  entries: Entry[];
  roundViews: SharedView[];
  dissolved: boolean;
  skipped: string[];
};
export const categoryNames: Record<Category, string> = {
  self: "认识自己",
  interests: "兴趣与审美",
  food: "饮食小事",
  daily: "日常生活",
  friendship: "友情与边界",
  emotions: "情绪与经历",
  future: "未来与价值",
  intimacy: "亲密关系",
};
