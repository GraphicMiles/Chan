import { O2TvPlugin, SearchResponse, SeasonsResponse, EpisodesResponse, ResolveResponse } from './O2TvPlugin';
import { apiPath } from '../shared/lib/api.js'

export class O2TvWeb implements O2TvPlugin {
  async search(options: { query: string }): Promise<SearchResponse> {
    // Fallback to server-side API when running on web
    const response = await fetch(apiPath('/api/media'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'search',
        layer: 'direct',
        query: options.query,
      }),
    });
    
    const data = await response.json();
    return { shows: data.results || [] };
  }
  
  async getSeasons(options: { showSlug: string }): Promise<SeasonsResponse> {
    const response = await fetch(apiPath('/api/media'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'o2tvSeasons',
        showSlug: options.showSlug,
      }),
    });
    
    const data = await response.json();
    return { seasons: data.results || [] };
  }
  
  async getEpisodes(options: { showSlug: string; seasonNum: number }): Promise<EpisodesResponse> {
    const response = await fetch(apiPath('/api/media'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'o2tvEpisodes',
        showSlug: options.showSlug,
        seasonNum: options.seasonNum,
      }),
    });
    
    const data = await response.json();
    return { episodes: data.results || [] };
  }
  
  async resolveEpisode(options: {
    showName: string;
    showSlug: string;
    seasonNum: number;
    epNum: number;
  }): Promise<ResolveResponse> {
    const response = await fetch(apiPath('/api/media'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'o2tvResolve',
        showName: options.showName,
        showSlug: options.showSlug,
        seasonNum: options.seasonNum,
        episodeNum: options.epNum,
      }),
    });
    
    const data = await response.json();
    return { url: data.results?.[0]?.url || null };
  }
}
