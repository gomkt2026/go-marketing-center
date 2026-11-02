export interface OfficeAgent {
  id: string;
  roleCode: string;
  brandSlug: string | null;
  displayName: string;
  color: string | null;
  persona: {
    nickname?: string;
    characterTitle?: string;
    temperament?: string;
    catchphrase?: string;
    focus?: string;
  };
  status: 'working' | 'done' | 'blocked' | string;
  task: string;
  artifactType: string | null;
  artifactId: string | null;
  preview: {
    id: string;
    title: string | null;
    target_platform: string;
    slug: string;
    body: string | null;
    file_url: string | null;
  } | null;
  updatedAt: string | null;
}

export interface OfficeBrandPlan {
  slug: string;
  theme: string;
  doMore?: string[];
  doLess?: string[];
  finding?: string;
}

export interface OfficeSnapshot {
  autoPublish: boolean;
  quiet: boolean;
  budgetUsd: number;
  monthSpendUsd: number;
  standup: {
    id: string;
    started_at: string;
    status: string;
    directive: { brands?: OfficeBrandPlan[]; podcastTopic?: string; imageBrief?: string };
    bubbles: { who: string; text: string }[];
    cost_usd: string | number;
    apply_to_generation: boolean;
    valid_until: string | null;
    note: string | null;
  } | null;
  signals: { id: string; title: string; summary: string | null; source_url: string | null; slug: string }[];
  podcasts: { id: string; title: string; status: string }[];
  videos: { id: string; title: string; status: string; final_url: string | null; preview_url: string | null }[];
  findings: { slug: string; summary: string; source_url: string | null }[];
  agents: OfficeAgent[];
}
