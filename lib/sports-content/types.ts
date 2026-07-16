export type GoverningBody = "IFAB" | "FIFA";

export type SportTopicDefinition = {
  key: string;
  label: string;
  group: "video" | "rules" | "library" | "institutional";
  aliases?: string[];
};

export type SportLibraryDefinition = {
  title: string;
  governingBody: GoverningBody;
  officialSourceBase: string;
  activeSeasonLabel: string;
  sourceVersionLabel: string;
};

export type SportContentDefinition = {
  key: string;
  label: string;
  shortLabel: string;
  heroDescription: string;
  governingBody: GoverningBody;
  library: SportLibraryDefinition;
  topics: SportTopicDefinition[];
  disallowedTopics: string[];
  defaultActivityTypes: string[];
};

export function defineTopic(
  key: string,
  label: string,
  group: SportTopicDefinition["group"],
  aliases: string[] = []
): SportTopicDefinition {
  return { key, label, group, aliases };
}
