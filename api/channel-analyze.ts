import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ── YouTube 채널 ID 추출 ──

async function resolveChannelId(input: string): Promise<{ channelId: string; channelName: string } | null> {
  const url = input.trim();

  // 1. /channel/UCXXX 직접 패턴
  const channelIdMatch = url.match(/\/channel\/(UC[\w-]+)/);
  if (channelIdMatch) return { channelId: channelIdMatch[1], channelName: channelIdMatch[1] };

  // 2. @handle 또는 검색어 추출
  const handleMatch = url.match(/@([^\s/]+)/);
  let handle = handleMatch?.[1]
    || url.replace(/^https?:\/\/(www\.)?youtube\.com\/?/, '').replace(/^@/, '').split('/')[0].split('?')[0];
  handle = handle.trim().replace(/^@/, '');
  if (!handle) return null;

  // YouTube Data API v3로 채널 검색 (가장 안정적)
  const ytApiKey = process.env.YOUTUBE_DATA_API_KEY || process.env.GEMINI_API_KEY;
  if (ytApiKey) {
    try {
      const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=channel&q=${encodeURIComponent(handle)}&maxResults=1&key=${ytApiKey}`;
      console.log('[channel-analyze] YouTube API search:', handle);
      const handleRes = await fetch(searchUrl);
      const responseText = await handleRes.text();
      console.log('[channel-analyze] YouTube API status:', handleRes.status, 'length:', responseText.length);
      if (handleRes.ok) {
        const data = JSON.parse(responseText);
        const item = data.items?.[0];
        if (item) {
          return {
            channelId: item.snippet.channelId || item.id.channelId,
            channelName: item.snippet.channelTitle || handle,
          };
        }
        console.log('[channel-analyze] No items in YouTube API response');
      } else {
        console.log('[channel-analyze] YouTube API error:', responseText.slice(0, 300));
      }
    } catch (e: any) {
      console.log('[channel-analyze] YouTube API exception:', e.message);
    }
  } else {
    console.log('[channel-analyze] No API key available');
  }

  // 폴백: YouTube 페이지 직접 fetch (Vercel에서는 봇 감지로 실패할 수 있음)
  console.log('[channel-analyze] Trying page fetch for handle:', handle);
  try {
    const res = await fetch(`https://www.youtube.com/@${handle}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });
    console.log('[channel-analyze] Page fetch status:', res.status);
    if (res.ok) {
      const html = await res.text();
      console.log('[channel-analyze] HTML length:', html.length, 'has canonical:', html.includes('canonical'));
      const patterns = [
        /<link rel="canonical" href="[^"]*\/channel\/(UC[\w-]+)"/,
        /"browseId":"(UC[\w-]+)"/,
        /channel_id=(UC[\w-]+)/,
        /"channelId":"(UC[\w-]+)"/,
      ];
      for (const pat of patterns) {
        const m = html.match(pat);
        if (m) {
          const nameMatch = html.match(/<title>([^<]+)/);
          return { channelId: m[1], channelName: nameMatch?.[1]?.replace(/ - YouTube$/, '').trim() || handle };
        }
      }
    }
  } catch { /* ignore */ }

  return null;
}

// ── RSS 피드로 최근 영상 가져오기 (API 키 불필요) ──

interface VideoInfo { id: string; title: string; description: string; }

async function getRecentVideos(channelId: string, maxResults = 15): Promise<VideoInfo[]> {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const res = await fetch(rssUrl);
  if (!res.ok) return [];

  const xml = await res.text();
  const videos: VideoInfo[] = [];
  const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"');

  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const entry of entries.slice(0, maxResults)) {
    const idMatch = entry.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/);
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    const descMatch = entry.match(/<media:description>([\s\S]*?)<\/media:description>/);
    if (idMatch) {
      videos.push({
        id: idMatch[1],
        title: decode(titleMatch?.[1] || ''),
        description: decode(descMatch?.[1] || ''),
      });
    }
  }
  return videos;
}

// ── 영상 설명 추출 (자막 대안 — YouTube 봇 방지로 자막 직접 추출 불가) ──

async function getVideoDescription(videoId: string): Promise<string | null> {
  try {
    // oembed API로 제목 가져오기
    const oembedRes = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`);
    if (oembedRes.ok) {
      const data = await oembedRes.json();
      return data.title || null;
    }
    return null;
  } catch {
    return null;
  }
}

// ── Gemini로 스타일 분석 ──

function pickGeminiKey(): string | undefined {
  const keys = [process.env.GEMINI_API_KEY, process.env.GEMINI_API_KEY_2].filter(Boolean) as string[];
  return keys.length > 0 ? keys[Math.floor(Math.random() * keys.length)] : undefined;
}

interface ChannelStyle {
  channelName: string;
  tone: string;
  hookPattern: string;
  sentenceStyle: string;
  structure: string;
  characteristics: string[];
  samplePrompt: string;
}

async function analyzeChannelStyle(videoData: string, channelName: string, apiKey: string): Promise<ChannelStyle> {
  const ai = new GoogleGenAI({ apiKey });

  const prompt = `아래는 유튜브 채널 "${channelName}"의 최근 영상 제목과 설명입니다.
제목 패턴, 주제 선택, 톤, 타겟 시청자, 콘텐츠 장르를 추론하세요.
제목이 짧더라도 반복되는 패턴, 장르, 키워드, 해시태그에서 채널의 성격을 파악하세요.

${videoData}

다음 JSON 형식으로 출력하세요 (JSON만, 설명 없이):
{
  "channelName": "${channelName}",
  "tone": "이 채널의 예상 톤 한 문장 (예: 친근하고 유머러스한 톤, 전문적이고 차분한 톤)",
  "hookPattern": "예상 도입부(훅) 패턴 (예: 질문형, 충격 팩트, 감성 오프닝, 상황극)",
  "sentenceStyle": "예상 문장 스타일 (예: 짧고 임팩트 있는 문장, 대화체, 스토리텔링)",
  "structure": "예상 영상 구조 (예: 도입→전개→반전→마무리, 일상 브이로그형, 리스트형)",
  "characteristics": ["채널 특징 3가지 — 장르, 타겟 시청자, 고유한 스타일 등"],
  "samplePrompt": "이 채널 스타일을 모방하여 대본을 작성하기 위한 프롬프트 지시문 3~5문장. 채널의 톤, 문장 스타일, 구조 패턴을 구체적으로 지시하세요."
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { maxOutputTokens: 2048 },
  });

  const text = response.text ?? '';
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    return {
      channelName,
      tone: '분석 실패 — 자막이 충분하지 않습니다',
      hookPattern: '알 수 없음',
      sentenceStyle: '알 수 없음',
      structure: '알 수 없음',
      characteristics: [],
      samplePrompt: '',
    };
  }
}

// ── 메인 핸들러 ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { channelUrl } = req.body;
  if (!channelUrl) return res.status(400).json({ error: 'channelUrl required' });

  const apiKey = (req.headers['x-custom-api-key'] as string) || pickGeminiKey();
  if (!apiKey) return res.status(400).json({ error: 'API key not configured' });

  try {
    // 1. 채널 ID 추출
    const resolved = await resolveChannelId(channelUrl);
    if (!resolved) {
      return res.status(400).json({
        error: '채널을 찾을 수 없습니다. 정확한 YouTube 핸들(@채널명)을 입력해주세요. YouTube에서 채널 페이지 URL을 복사하면 가장 정확합니다.',
      });
    }
    const { channelId, channelName: resolvedName } = resolved;

    // 2. 최근 영상 목록 (RSS, API 키 불필요)
    const videos = await getRecentVideos(channelId, 15);
    if (videos.length === 0) {
      return res.status(400).json({ error: '채널에서 영상을 찾을 수 없습니다.' });
    }

    // 3. 제목 + 설명 기반 분석 데이터 구성
    const videoData = videos.map((v, i) =>
      `[${i + 1}] 제목: ${v.title}${v.description && v.description.length > 3 ? `\n    설명: ${v.description.slice(0, 200)}` : ''}`
    ).join('\n');
    const analyzedTitles = videos.map(v => v.title);

    // 4. Gemini 스타일 분석
    const channelName = resolvedName || channelId;
    const style = await analyzeChannelStyle(videoData, channelName, apiKey);

    return res.json({
      success: true,
      style,
      analyzedCount: videos.length,
      analyzedTitles: analyzedTitles.slice(0, 5),
    });
  } catch (error: any) {
    console.error('[channel-analyze]', error.message);
    return res.status(500).json({ error: error.message || '채널 분석에 실패했습니다.' });
  }
}
