export const GENERAL_KNOWLEDGE_NOTICE =
  "温馨提示：这个问题与健康用药无关，以下仅作一般常识参考。";

const noticePattern =
  /温馨提示[：:]\s*这个问题与健康用药无关[^。\n]*。/g;

export function stripGeneralKnowledgeNotices(text: string): string {
  return text
    .replace(noticePattern, "")
    .replace(/^>\s*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function addGeneralKnowledgeNotice(text: string): string {
  const body = stripGeneralKnowledgeNotices(text);
  return `> ${GENERAL_KNOWLEDGE_NOTICE}${body ? `\n\n${body}` : ""}`;
}
