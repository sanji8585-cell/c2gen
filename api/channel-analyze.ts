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
  const ytApiKey = process.env.YOUTUBE_DATA_API_KEY || null;
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

// ── Gemini로 YouTube 영상 대사 추출 + 스타일 분석 ──
// Gemini는 YouTube URL을 직접 이해하고 대사를 추출할 수 있음

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

async function analyzeChannelStyle(videos: VideoInfo[], channelName: string, apiKey: string): Promise<ChannelStyle> {
  const ai = new GoogleGenAI({ apiKey });

  // Gemini에게 YouTube URL을 직접 주고 대사 추출 + 스타일 분석 요청
  const videoUrls = videos.slice(0, 5).map((v, i) =>
    `[영상 ${i + 1}] "${v.title}" — https://www.youtube.com/watch?v=${v.id}`
  ).join('\n');

  const prompt = `아래 유튜브 채널 "${channelName}"의 영상들을 분석해주세요.
각 영상의 URL에 접근하여 대사/나레이션을 추출하고, 이 채널의 대본 스타일을 분석하세요.

${videoUrls}

다음 JSON 형식으로 출력하세요:
{
  "channelName": "${channelName}",
  "tone": "이 채널의 톤 (예: 친근한 언니 톤, 전문가 뉴스 앵커 톤, 유머러스한 예능 톤)",
  "hookPattern": "도입부(훅) 패턴 (예: 질문형 오프닝, 충격 팩트, 감성적 시작, 상황극)",
  "sentenceStyle": "문장 스타일 (예: 짧고 끊어치기, 대화체, 서술형 나레이션, 감탄사 활용)",
  "structure": "영상 구조 (예: 도입→전개→반전→마무리, 리스트형, 일상 브이로그형)",
  "characteristics": ["특징1", "특징2", "특징3"],
  "samplePrompt": "이 채널 스타일로 대본을 생성하기 위한 구체적 프롬프트 지시문 3~5문장. 톤, 문장 길이, 훅 패턴, 구조를 명확히 지시하세요."
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: { maxOutputTokens: 4096, responseMimeType: 'application/json' },
  });

  const text = response.text ?? '';
  const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    console.error('[channel-analyze] JSON parse failed. Raw:', text.slice(0, 500));
    return {
      channelName,
      tone: '분석 실패',
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

  const sessionToken = req.headers['x-session-token'] as string;
  if (!sessionToken) return res.status(401).json({ error: '로그인이 필요합니다' });

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

    // 3. Gemini에게 YouTube URL 직접 전달 → 대사 추출 + 스타일 분석
    const channelName = resolvedName || channelId;
    const style = await analyzeChannelStyle(videos, channelName, apiKey);
    const analyzedTitles = videos.slice(0, 5).map(v => v.title);

    return res.json({
      success: true,
      style,
      analyzedCount: Math.min(videos.length, 5),
      analyzedTitles,
    });
  } catch (error: any) {
    console.error('[channel-analyze]', error.message);
    return res.status(500).json({ error: error.message || '채널 분석에 실패했습니다.' });
  }
}
