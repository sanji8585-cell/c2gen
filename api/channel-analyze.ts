import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ── YouTube 채널 ID 추출 ──

async function resolveChannelId(input: string): Promise<{ channelId: string; channelName: string } | null> {
  const url = input.trim();

  // 1. /channel/UCXXX 직접 패턴
  const channelIdMatch = url.match(/\/channel\/(UC[\w-]+)/);
  if (channelIdMatch) return { channelId: channelIdMatch[1], channelName: channelIdMatch[1] };

  // 2. @handle 추출 (한글/유니코드 지원)
  const handleMatch = url.match(/@([^\s/]+)/);
  const handle = handleMatch?.[1]
    || url.replace(/^https?:\/\/(www\.)?youtube\.com\/?/, '').replace(/^@/, '').split('/')[0].split('?')[0];

  if (!handle) return null;

  // 방법 A: YouTube 페이지 fetch (다양한 User-Agent 시도)
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
  ];

  for (const ua of userAgents) {
    try {
      const res = await fetch(`https://www.youtube.com/@${encodeURIComponent(handle)}`, {
        headers: {
          'User-Agent': ua,
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8',
          'Accept': 'text/html',
        },
        redirect: 'follow',
      });
      const html = await res.text();

      // channelId 추출 (여러 패턴 시도)
      const patterns = [
        /"channelId":"(UC[\w-]+)"/,
        /channel_id=(UC[\w-]+)/,
        /"externalId":"(UC[\w-]+)"/,
        /data-channel-external-id="(UC[\w-]+)"/,
        /<meta\s+itemprop="channelId"\s+content="(UC[\w-]+)"/,
        /browse_id":"(UC[\w-]+)"/,
      ];

      for (const pat of patterns) {
        const m = html.match(pat);
        if (m) {
          // 채널 이름도 추출 시도
          const nameMatch = html.match(/"title":"([^"]+)"/) || html.match(/<title>([^<]+)/);
          const name = nameMatch?.[1]?.replace(/ - YouTube$/, '').trim() || handle;
          return { channelId: m[1], channelName: name };
        }
      }
    } catch { /* 다음 UA 시도 */ }
  }

  // 방법 B: YouTube oembed API (handle → 채널 정보)
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/@${encodeURIComponent(handle)}&format=json`;
    const res = await fetch(oembedUrl);
    if (res.ok) {
      const data = await res.json();
      // oembed는 channelId를 직접 주지 않지만 author_url에서 추출 가능
      const cidMatch = data.author_url?.match(/\/channel\/(UC[\w-]+)/);
      if (cidMatch) return { channelId: cidMatch[1], channelName: data.author_name || handle };
    }
  } catch { /* ignore */ }

  return null;
}

// ── RSS 피드로 최근 영상 가져오기 (API 키 불필요) ──

interface VideoInfo { id: string; title: string; }

async function getRecentVideos(channelId: string, maxResults = 10): Promise<VideoInfo[]> {
  const rssUrl = `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`;
  const res = await fetch(rssUrl);
  if (!res.ok) return [];

  const xml = await res.text();
  const videos: VideoInfo[] = [];

  // 간단한 XML 파싱 (정규식)
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) || [];
  for (const entry of entries.slice(0, maxResults)) {
    const idMatch = entry.match(/<yt:videoId>([\w-]+)<\/yt:videoId>/);
    const titleMatch = entry.match(/<title>([\s\S]*?)<\/title>/);
    if (idMatch) {
      videos.push({
        id: idMatch[1],
        title: titleMatch?.[1]?.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>') || '',
      });
    }
  }
  return videos;
}

// ── 자막 추출 (youtube-transcript 패키지) ──

async function getTranscript(videoId: string): Promise<string | null> {
  try {
    // ESM 패키지 동적 import
    const { YoutubeTranscript } = await import('youtube-transcript');
    const transcript = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'ko' });
    if (!transcript || transcript.length === 0) {
      // 한국어 없으면 기본 언어로 재시도
      const fallback = await YoutubeTranscript.fetchTranscript(videoId);
      return fallback?.map((t: any) => t.text).join(' ') || null;
    }
    return transcript.map((t: any) => t.text).join(' ');
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

async function analyzeChannelStyle(transcripts: string[], channelName: string, apiKey: string): Promise<ChannelStyle> {
  const ai = new GoogleGenAI({ apiKey });

  const combinedText = transcripts.map((t, i) => `[영상 ${i + 1}]\n${t.slice(0, 1500)}`).join('\n\n');

  const prompt = `아래는 유튜브 채널 "${channelName}"의 최근 쇼츠/영상 자막입니다.
이 채널의 대본 스타일을 분석하세요.

${combinedText}

다음 JSON 형식으로 출력하세요 (JSON만, 설명 없이):
{
  "channelName": "${channelName}",
  "tone": "이 채널의 톤을 한 문장으로 (예: 친근한 언니 톤, 전문가 뉴스 앵커 톤)",
  "hookPattern": "도입부(훅) 패턴 (예: 질문형 오프닝, 충격 팩트, 반직관 명제)",
  "sentenceStyle": "문장 스타일 (예: 짧고 끊어치기, 긴 서술형, 대화체)",
  "structure": "영상 구조 패턴 (예: 문제제기→반전→CTA, 리스트형→결론)",
  "characteristics": ["특징1", "특징2", "특징3"],
  "samplePrompt": "이 채널 스타일로 대본을 생성하기 위한 프롬프트 지시문 (3~5문장)"
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
      return res.status(400).json({ error: '채널을 찾을 수 없습니다. URL을 확인해주세요. (예: https://youtube.com/@채널명)' });
    }
    const { channelId, channelName: resolvedName } = resolved;

    // 2. 최근 영상 목록 (RSS, API 키 불필요)
    const videos = await getRecentVideos(channelId, 8);
    if (videos.length === 0) {
      return res.status(400).json({ error: '채널에서 영상을 찾을 수 없습니다.' });
    }

    // 3. 자막 추출 (최대 5개 성공할 때까지)
    const transcripts: string[] = [];
    const analyzedTitles: string[] = [];
    for (const video of videos) {
      if (transcripts.length >= 5) break;
      const transcript = await getTranscript(video.id);
      if (transcript && transcript.length > 50) {
        transcripts.push(transcript);
        analyzedTitles.push(video.title);
      }
    }

    if (transcripts.length === 0) {
      return res.status(400).json({ error: '자막을 추출할 수 있는 영상이 없습니다. 자막이 있는 채널을 시도해주세요.' });
    }

    // 4. Gemini 스타일 분석
    const channelName = resolvedName || channelId;
    const style = await analyzeChannelStyle(transcripts, channelName, apiKey);

    return res.json({
      success: true,
      style,
      analyzedCount: transcripts.length,
      analyzedTitles,
    });
  } catch (error: any) {
    console.error('[channel-analyze]', error.message);
    return res.status(500).json({ error: error.message || '채널 분석에 실패했습니다.' });
  }
}
