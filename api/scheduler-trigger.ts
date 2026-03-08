import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// ── Shared utilities (inlined for Vercel serverless compatibility) ──

function getSupabase() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_KEY must be set');
  return createClient(url, key);
}

function computeNextRun(schedule: Record<string, unknown>): string {
  const now = new Date();
  const timeStr = (schedule.time as string) || '10:00';
  const [hours, minutes] = timeStr.split(':').map(Number);
  const next = new Date(now);
  next.setHours(hours, minutes, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  if (schedule.frequency === 'weekly' && Array.isArray(schedule.days) && schedule.days.length) {
    const dayMap: Record<string, number> = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };
    const targetDays = (schedule.days as string[]).map((d: string) => dayMap[d] ?? 0);
    while (!targetDays.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }
  }
  return next.toISOString();
}

function pickTopic(topicStrategy: Record<string, unknown>): { topic: string; source: string } {
  const pool = topicStrategy.keyword_pool;
  if (Array.isArray(pool) && pool.length > 0) {
    const idx = Math.floor(Math.random() * pool.length);
    return { topic: pool[idx] as string, source: 'keyword_pool' };
  }

  const series = topicStrategy.series_template;
  if (series && typeof series === 'object' && 'topic' in (series as Record<string, unknown>)) {
    return { topic: (series as Record<string, string>).topic, source: 'series_template' };
  }

  return { topic: 'auto-generated', source: 'default' };
}

// ── 핸들러 ──

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel Cron calls with GET by default; also allow POST
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getSupabase();
    const now = new Date().toISOString();

    // Find active campaigns where schedule.next_run <= now
    const { data: campaigns, error: fetchErr } = await supabase
      .from('c2gen_campaigns')
      .select('*')
      .eq('status', 'active')
      .not('schedule', 'is', null);

    if (fetchErr) throw fetchErr;

    let triggered = 0;
    let skipped = 0;

    for (const campaign of campaigns || []) {
      const schedule = (campaign.schedule || {}) as Record<string, unknown>;
      const nextRun = schedule.next_run as string | undefined;

      // Skip if next_run is in the future or not set
      if (!nextRun || nextRun > now) {
        skipped++;
        continue;
      }

      // Check daily budget limit
      if (campaign.budget_limit_daily > 0 && campaign.budget_used_today >= campaign.budget_limit_daily) {
        skipped++;
        continue;
      }

      // Check monthly budget limit
      if (campaign.budget_limit_monthly > 0 && campaign.budget_used_month >= campaign.budget_limit_monthly) {
        skipped++;
        continue;
      }

      // Check max daily count — count today's generated items
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const { count: todayCount } = await supabase
        .from('c2gen_approval_queue')
        .select('id', { count: 'exact', head: true })
        .eq('campaign_id', campaign.id)
        .gte('created_at', todayStart.toISOString());

      if ((todayCount || 0) >= campaign.max_daily_count) {
        skipped++;
        continue;
      }

      // Pick topic from strategy
      const topicStrategy = (campaign.topic_strategy || {}) as Record<string, unknown>;
      const { topic, source } = pickTopic(topicStrategy);

      // Estimate credits (script + images + TTS baseline)
      const estimatedCredits = 5 + 16 * 5 + 15 * 3; // ~130 credits

      // Create approval queue entry
      const { error: insertErr } = await supabase
        .from('c2gen_approval_queue')
        .insert({
          campaign_id: campaign.id,
          content_data: {
            topic,
            topic_source: source,
            target_platforms: campaign.target_platforms,
            video_engine_mode: campaign.video_engine_mode,
            brand_preset_id: campaign.brand_preset_id,
            channel_id: campaign.channel_id,
          },
          estimated_credits: estimatedCredits,
          status: 'pending',
          metadata: {
            triggered_at: now,
            schedule_time: schedule.time,
          },
        });

      if (insertErr) {
        skipped++;
        continue;
      }

      // Update campaign counters and next_run
      const updatedSchedule = { ...schedule, next_run: computeNextRun(schedule) };

      await supabase
        .from('c2gen_campaigns')
        .update({
          total_generated: (campaign.total_generated || 0) + 1,
          budget_used_today: (campaign.budget_used_today || 0) + estimatedCredits,
          schedule: updatedSchedule,
          updated_at: now,
        })
        .eq('id', campaign.id);

      triggered++;
    }

    return res.json({ success: true, triggered, skipped });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Internal server error';
    return res.status(500).json({ success: false, message });
  }
}
