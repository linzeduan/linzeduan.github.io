import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { unzipSync, strFromU8 } from "fflate";

const check = process.argv.includes("--check");
const source = new URL("../docs/400问.docx", import.meta.url);
const output = new URL("../src/content/questions.json", import.meta.url);
const provenance = new URL("../src/content/provenance.json", import.meta.url);
const hash = (value) => createHash("sha256").update(value).digest("hex");
const decode = (value) =>
  value
    .replace(/&#x([\da-f]+);/gi, (_, n) =>
      String.fromCodePoint(parseInt(n, 16)),
    )
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
let bytes;
try {
  bytes = await readFile(source);
} catch (error) {
  if (!check || error.code !== "ENOENT") throw error;
}
let originals;
if (bytes) {
  const xml = strFromU8(unzipSync(bytes)["word/document.xml"]);
  const text = [...xml.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
    .map((m) => decode(m[1]))
    .join("");
  originals = [...text.matchAll(/(\d+)\.\s*([\s\S]*?)(?=\d+\.\s*|$)/g)].map(
    (match) => ({ originalNumber: Number(match[1]), content: match[2].trim() }),
  );
} else {
  originals = JSON.parse(await readFile(output, "utf8")).map(
    ({ originalNumber, content }) => ({ originalNumber, content }),
  );
}
if (
  originals.length !== 400 ||
  originals.some((q, i) => q.originalNumber !== i + 1 || !q.content)
) {
  throw new Error(
    "Expected exactly 400 nonempty questions numbered 1 through 400.",
  );
}
const firstCategories = {
  self: [1, 2, 3, 4, 5, 6, 7, 10, 11, 12, 49, 50, 51, 83, 91, 98],
  interests: [
    8, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33,
    34, 35, 37, 86, 87, 94,
  ],
  food: [9, 16, 17, 40, 41, 52, 53],
  daily: [42, 43, 45, 46, 47, 57, 80],
  friendship: [
    36, 38, 39, 55, 58, 60, 61, 62, 66, 67, 69, 70, 73, 74, 84, 85, 93, 96, 97,
    99, 100,
  ],
  emotions: [44, 48, 68, 71, 72, 75, 76, 77, 78, 79, 92],
  future: [56, 88, 89, 90],
  intimacy: [13, 54, 59, 63, 64, 65, 81, 82, 95],
};
const medium = new Set([
  1, 2, 3, 5, 11, 38, 44, 46, 48, 50, 55, 58, 62, 68, 71, 75, 76, 77, 78, 79,
  83, 89, 92, 100, 103, 107, 115, 117, 119, 123, 125, 129, 132, 134, 139, 145,
  149, 151, 154, 155, 156, 157, 159, 164, 166, 168, 171, 174, 175, 178, 183,
  184, 186, 188, 191, 196, 197, 199, 208, 230, 273, 286, 301, 334, 335, 342,
  343, 347, 368, 369, 370, 380, 383,
]);
const high = new Set([133, 144, 341]);
const similarGroups = [
  [99, 101],
  [104, 177],
  [110, 182],
  [102, 191],
  [107, 154, 166],
  [115, 143, 196],
  [119, 174],
  [125, 148, 193],
  [86, 87, 153],
  [111, 179],
  [52, 221, 257],
  [17, 207, 234],
  [40, 247],
  [80, 390],
  [301, 351, 352],
  [15, 325, 326, 399],
  [32, 31],
  [66, 93, 150, 376],
];
function classify(q) {
  const n = q.originalNumber;
  const category =
    n >= 301
      ? "daily"
      : n >= 201
        ? "food"
        : n >= 101
          ? "friendship"
          : Object.entries(firstCategories).find(([, nums]) =>
              nums.includes(n),
            )?.[0];
  if (!category) throw new Error(`Missing category for ${n}`);
  const sensitivity = high.has(n)
    ? "high"
    : medium.has(n) || category === "intimacy"
      ? "medium"
      : "low";
  const difficulty =
    /未来|梦想|遗憾|三观|定义|意义|保质期|价值|相处方式|理想的友谊/.test(
      q.content,
    )
      ? 3
      : category === "friendship" ||
          category === "emotions" ||
          category === "intimacy" ||
          category === "future"
        ? 2
        : 1;
  return {
    questionId: `q${String(n).padStart(3, "0")}`,
    ...q,
    category,
    difficulty,
    sensitivity,
    recommendedStage:
      difficulty === 3 || sensitivity === "high"
        ? "deep"
        : difficulty === 2 || sensitivity === "medium"
          ? "familiar"
          : "initial",
    enabled: true,
  };
}
const questions = originals.map(classify);
// Stable editorial ordering; topic rotation and similarity gaps are deterministic.
const opening = [57, 14, 201, 24, 325, 8, 363, 84, 21, 310, 16, 45, 87, 56];
const ordered = opening.map((n) => questions[n - 1]);
const remaining = questions.filter(
  (q) => !opening.includes(q.originalNumber) && q.sensitivity !== "high",
);
const pattern = [1, 2, 1, 3];
while (remaining.length) {
  const target =
    ordered.length < 14 ? 1 : pattern[ordered.length % pattern.length];
  let best = -Infinity,
    at = 0;
  remaining.forEach((q, i) => {
    const recent = ordered.slice(-3);
    const similar = similarGroups.find((group) =>
      group.includes(q.originalNumber),
    );
    const nearSimilar =
      similar &&
      ordered.slice(-14).some((item) => similar.includes(item.originalNumber));
    const score =
      -(Math.abs(q.difficulty - target) * 4) -
      (recent.some((item) => item.category === q.category) ? 7 : 0) -
      (nearSimilar ? 100 : 0) -
      (q.sensitivity === "medium" && ordered.length < 30 ? 8 : 0) -
      q.originalNumber / 10000;
    if (score > best) {
      best = score;
      at = i;
    }
  });
  ordered.push(remaining.splice(at, 1)[0]);
}
const plan = {
  version: "v1",
  automaticQuestionIds: ordered.map((q) => q.questionId),
  optInQuestionIds: questions
    .filter((q) => q.sensitivity === "high")
    .map((q) => q.questionId),
  similarGroups,
};
const originalContentSha256 = hash(JSON.stringify(originals));
const meta = {
  sourceFile: "docs/400问.docx",
  sourceFileSha256: bytes ? hash(bytes) : null,
  originalContentSha256,
  count: 400,
  parsing:
    "OOXML w:t text joined in document order; numeric delimiters; trim surrounding whitespace only",
};
if (check) {
  const stored = JSON.parse(await readFile(output, "utf8"));
  const recorded = JSON.parse(await readFile(provenance, "utf8"));
  if (JSON.stringify(stored) !== JSON.stringify(questions))
    throw new Error(
      "Question content or annotations differ from source/configuration.",
    );
  if (
    recorded.originalContentSha256 !== originalContentSha256 ||
    (bytes && recorded.sourceFileSha256 !== meta.sourceFileSha256)
  )
    throw new Error("Source checksum mismatch.");
  const storedPlan = JSON.parse(
    await readFile(
      new URL("../src/content/plan.json", import.meta.url),
      "utf8",
    ),
  );
  if (JSON.stringify(storedPlan) !== JSON.stringify(plan))
    throw new Error(
      "Recommendation plan differs from deterministic generation.",
    );
  console.log(
    `400 questions verified; ${plan.automaticQuestionIds.length} automatic, ${plan.optInQuestionIds.length} opt-in; ${bytes ? "DOCX verified" : "content checksum verified (DOCX not distributed)"}.`,
  );
} else {
  await mkdir(new URL("../src/content/", import.meta.url), { recursive: true });
  for (const [path, data] of [
    [output, questions],
    [provenance, meta],
    [new URL("../src/content/plan.json", import.meta.url), plan],
  ])
    await writeFile(path, JSON.stringify(data, null, 2) + "\n");
  const report = `# 题库整理报告\n\n来源：本地 docs/400问.docx。400 题，编号连续，无空题、重复编号和字面完全重复。原文保留，仅剥离编号分隔符及内容两侧空白。原始文档不进入公开仓库，公开构建包含题目正文。\n\n## 处理原则\n\n分类与难度是编辑建议，不评价使用者。所有题目 enabled=true；高敏感题不进入默认日程，需要双方逐题同意。推荐顺序版本为 v1，已开始的空间冻结版本。共 ${plan.automaticQuestionIds.length} 道默认题，${plan.optInQuestionIds.length} 道需要明确同意。\n\n## 相似题建议\n\n${similarGroups.map((g) => `- ${g.join(" / ")}：保留全部原题；相近表达分散到不同日期。`).join("\n")}\n\n## 敏感与措辞\n\n- 133 涉及分享密码；应用不收集实际密码。\n- 144 涉及翻看相册；只询问边界观念，不索取相册。\n- 341 涉及生理期及身体不适；不按性别限定题目，允许跳过。\n- 恋爱题归于关系主题，不暗示双方是恋人；保留原文二选一表达，回答可自由展开。\n- 身体、健康、家庭、金钱及情绪类按具体内容标注 medium；任何题都可跳过。\n- 相似组是编辑建议，并非穷尽；不自动合并或删除。\n\n## 逐题索引\n\n| 原编号 | ID | 主题 | 难度 | 敏感程度 | 建议阶段 |\n|---|---|---|---|---|---|\n${questions.map((q) => `| ${q.originalNumber} | ${q.questionId} | ${q.category} | ${q.difficulty} | ${q.sensitivity} | ${q.recommendedStage} |`).join("\n")}\n\n## 来源校验\n\n原文件 SHA-256：${meta.sourceFileSha256}\n\n原编号及正文规范 JSON SHA-256：${originalContentSha256}\n`;
  await writeFile(
    new URL("../docs/QUESTION_REVIEW.md", import.meta.url),
    report,
  );
  console.log(
    "Extracted 400 questions, immutable provenance and v1 recommendation plan.",
  );
}
