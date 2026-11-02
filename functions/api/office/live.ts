import type { PagesFunction } from '@cloudflare/workers-types';
import type { Env } from '../../_shared/env';
import { json, failLoad } from '../../_shared/response';
import { loadOfficeSnapshot } from '../../_shared/office-snapshot';

type AgentRow = {
  artifactId?: string | null;
  preview?: unknown;
  [key: string]: unknown;
};

type VideoRow = {
  final_url?: string | null;
  preview_url?: string | null;
  [key: string]: unknown;
};

/** 對外展示只留看得到的辦公室，不帶原稿、交代和片子網址。 */
function publicOffice(data: Awaited<ReturnType<typeof loadOfficeSnapshot>>) {
  const snapshot = data as {
    agents?: AgentRow[];
    videos?: VideoRow[];
    suggestions?: unknown[];
  };
  return {
    ...data,
    suggestions: [],
    videos: (snapshot.videos ?? []).map((video) => ({ ...video, final_url: null, preview_url: null })),
    agents: (snapshot.agents ?? []).map((agent) => ({ ...agent, artifactId: null, preview: null })),
  };
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const data = await loadOfficeSnapshot(context.env);
    return json(publicOffice(data), 200, { 'Cache-Control': 'public, max-age=20' });
  } catch (e) {
    return failLoad('行銷中心展示', e);
  }
};
