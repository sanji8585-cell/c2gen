import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabase, getKSTDateStr, validateAdminSession } from './lib/authUtils';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { action, ...params } = req.body;
  const supabase = getSupabase();

  try {
    switch (action) {
      case 'updateGamification': {
        const { token, xp: newXp, totalGenerations, streakCount, streakLastDate, gachaCount } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions')
          .select('email')
          .eq('token', token)
          .gt('expires_at', new Date().toISOString())
          .single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        // 레벨 서버 재계산 (무결성)
        const THRESHOLDS = [0, 50, 120, 200, 350, 500, 750, 1000, 1500, 2500];
        let computedLevel = 1;
        for (let i = THRESHOLDS.length - 1; i >= 0; i--) {
          if ((newXp || 0) >= THRESHOLDS[i]) { computedLevel = i + 1; break; }
        }

        const { error } = await supabase
          .from('c2gen_users')
          .update({
            xp: newXp || 0,
            level: computedLevel,
            total_generations: totalGenerations || 0,
            streak_count: streakCount || 0,
            streak_last_date: streakLastDate || null,
            gacha_count: gachaCount || 0,
          })
          .eq('email', session.email);

        if (error) {
          console.error('[api/gamification] updateGamification error:', error);
          return res.status(500).json({ error: error.message });
        }

        return res.json({ success: true });
      }

      // ── 게임 설정 로드 (공개) ──
      case 'game-getConfig': {
        const { data: configRows } = await supabase
          .from('c2gen_game_config')
          .select('key, value');

        if (!configRows || configRows.length === 0) {
          return res.json({ config: null, message: 'No game config found' });
        }

        const configMap: Record<string, any> = {};
        for (const row of configRows) configMap[row.key] = row.value;

        return res.json({
          config: {
            levels: configMap.levels || null,
            xpRates: configMap.xp_rates || null,
            gachaSettings: configMap.gacha_settings || null,
            streakSettings: configMap.streak_settings || null,
            milestoneSettings: configMap.milestone_settings || null,
            prestigeSettings: configMap.prestige_settings || null,
          },
        });
      }

      // ── 게임 설정 수정 (관리자) ──
      case 'game-updateConfig': {
        const { adminToken, key: cfgKey, value: cfgValue } = params;
        if (!(await validateAdminSession(supabase, adminToken))) {
          return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        }
        if (!cfgKey || cfgValue === undefined) {
          return res.status(400).json({ error: 'key와 value가 필요합니다.' });
        }

        const { error: cfgErr } = await supabase
          .from('c2gen_game_config')
          .upsert({
            key: cfgKey,
            value: cfgValue,
            updated_at: new Date().toISOString(),
            updated_by: 'admin',
          });

        if (cfgErr) return res.status(500).json({ error: cfgErr.message });
        return res.json({ success: true });
      }

      // ── 게임 상태 동기화 (로그인 시) ──
      case 'game-syncState': {
        const { token } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const email = session.email;
        const q = (query: PromiseLike<any>) => Promise.resolve(query);
        const todayStr = getKSTDateStr();
        const nowISO = new Date().toISOString();

        // ── 1단계: 독립 쿼리 7개를 병렬 실행 ──
        const [
          { data: configRows },
          { data: usr },
          { data: eqData },
          { data: achDefs },
          { data: achProgress },
          { data: questResult },
          { data: events },
          { data: invData },
        ] = await Promise.all([
          q(supabase.from('c2gen_game_config').select('key, value')),
          q(supabase.from('c2gen_users')
            .select('xp, level, total_generations, total_images, total_audio, total_videos, streak_count, streak_last_date, gacha_count, gacha_tickets, gacha_pity_epic, gacha_pity_legendary, total_gacha_pulls, max_combo, prestige_level, prestige_xp_bonus, login_days, sound_enabled')
            .eq('email', email).single()),
          q(supabase.from('c2gen_user_equipped').select('equipped_title, equipped_badges, equipped_frame')
            .eq('email', email).single()),
          q(supabase.from('c2gen_achievements').select('*').eq('is_active', true).order('sort_order')),
          q(supabase.from('c2gen_user_achievements').select('*').eq('email', email)),
          q(supabase.from('c2gen_user_quests').select('quest_id, progress, completed, reward_claimed')
            .eq('email', email).eq('assigned_date', todayStr)),
          q(supabase.from('c2gen_events').select('*').eq('is_active', true).lte('start_at', nowISO).gte('end_at', nowISO)),
          q(supabase.from('c2gen_user_inventory').select('id, item_id, quantity, obtained_via, is_equipped, is_active, active_until')
            .eq('email', email)),
        ]);

        // ── 설정 파싱 ──
        const configMap: Record<string, any> = {};
        for (const row of (configRows || [])) configMap[row.key] = row.value;
        const config = {
          levels: configMap.levels || null,
          xpRates: configMap.xp_rates || null,
          gachaSettings: configMap.gacha_settings || null,
          streakSettings: configMap.streak_settings || null,
          milestoneSettings: configMap.milestone_settings || null,
          prestigeSettings: configMap.prestige_settings || null,
        };

        // ── 유저 데이터 ──
        const user = {
          xp: usr?.xp ?? 0, level: usr?.level ?? 1,
          totalGenerations: usr?.total_generations ?? 0,
          totalImages: usr?.total_images ?? 0, totalAudio: usr?.total_audio ?? 0,
          totalVideos: usr?.total_videos ?? 0,
          streakCount: usr?.streak_count ?? 0, streakLastDate: usr?.streak_last_date ?? null,
          gachaTickets: usr?.gacha_tickets ?? 0,
          gachaPityEpic: usr?.gacha_pity_epic ?? 0, gachaPityLegendary: usr?.gacha_pity_legendary ?? 0,
          totalGachaPulls: usr?.total_gacha_pulls ?? 0,
          maxCombo: usr?.max_combo ?? 0,
          prestigeLevel: usr?.prestige_level ?? 0, prestigeXpBonus: usr?.prestige_xp_bonus ?? 0,
          loginDays: usr?.login_days ?? 0, soundEnabled: usr?.sound_enabled ?? false,
        };

        // ── 2단계: 장착 아이템 + 인벤토리 아이템 + 퀘스트 정의를 병렬로 조회 ──
        // 장착 아이템 ID 수집
        const equippedItemIds: string[] = [];
        if (eqData?.equipped_title) equippedItemIds.push(eqData.equipped_title);
        if (eqData?.equipped_frame) equippedItemIds.push(eqData.equipped_frame);
        if (eqData?.equipped_badges?.length > 0) equippedItemIds.push(...eqData.equipped_badges);

        // 인벤토리 아이템 ID 수집
        const invItemIds = [...new Set((invData || []).map((i: any) => i.item_id))];

        // 모든 필요한 gacha_pool ID를 합쳐서 한 번에 조회
        const allGachaIds = [...new Set([...equippedItemIds, ...invItemIds])];

        // 퀘스트 처리 준비
        let todayQuests = questResult;

        // 퀘스트 미배정 시 자동 배정 (이건 순차 처리 필요)
        if (!todayQuests || todayQuests.length === 0) {
          const { data: pool } = await q(supabase.from('c2gen_quest_pool')
            .select('*').eq('is_active', true).lte('min_level', user.level));
          const eligible = (pool || []).filter((qst: any) => !qst.max_level || qst.max_level >= user.level);
          if (eligible.length > 0) {
            const selected: any[] = [];
            const remaining = [...eligible];
            for (let i = 0; i < Math.min(3, remaining.length); i++) {
              const totalWeight = remaining.reduce((s: number, qst: any) => s + (qst.weight || 10), 0);
              let r = Math.random() * totalWeight;
              let pick = remaining[0];
              for (const qst of remaining) { r -= (qst.weight || 10); if (r <= 0) { pick = qst; break; } }
              selected.push(pick);
              remaining.splice(remaining.indexOf(pick), 1);
            }
            await Promise.all(selected.map(qst => q(supabase.from('c2gen_user_quests').upsert({
              email, quest_id: qst.id, assigned_date: todayStr,
              progress: 0, completed: false, reward_claimed: false,
            }, { onConflict: 'email,quest_id,assigned_date' }))));
            todayQuests = selected.map((qst: any) => ({ quest_id: qst.id, progress: 0, completed: false, reward_claimed: false }));
          }
        }

        const questIds = (todayQuests || []).map((qst: any) => qst.quest_id);

        // ── gacha_pool 조회 + 퀘스트 정의 조회 병렬 ──
        const [{ data: allGachaDefs }, { data: questDefs }] = await Promise.all([
          allGachaIds.length > 0
            ? q(supabase.from('c2gen_gacha_pool').select('*').in('id', allGachaIds))
            : Promise.resolve({ data: [] }),
          questIds.length > 0
            ? q(supabase.from('c2gen_quest_pool').select('*').in('id', questIds))
            : Promise.resolve({ data: [] }),
        ]);

        const gachaDefMap: Record<string, any> = {};
        for (const g of (allGachaDefs || [])) gachaDefMap[g.id] = g;

        // ── 장착 정보 조립 ──
        let equipped = { title: null as any, badges: [] as any[], frame: null as any };
        if (eqData) {
          if (eqData.equipped_title && gachaDefMap[eqData.equipped_title]) {
            const ti = gachaDefMap[eqData.equipped_title];
            equipped.title = { id: ti.id, name: ti.name, emoji: ti.emoji, rarity: ti.rarity || 'common' };
          }
          if (eqData.equipped_frame && gachaDefMap[eqData.equipped_frame]) {
            const fi = gachaDefMap[eqData.equipped_frame];
            equipped.frame = { id: fi.id, name: fi.name, emoji: fi.emoji, rarity: fi.rarity || 'common' };
          }
          for (const bid of (eqData.equipped_badges || [])) {
            if (gachaDefMap[bid]) {
              const bi = gachaDefMap[bid];
              equipped.badges.push({ id: bi.id, name: bi.name, emoji: bi.emoji, rarity: bi.rarity || 'common' });
            }
          }
        } else {
          await q(supabase.from('c2gen_user_equipped').upsert({ email, equipped_title: null, equipped_badges: [], equipped_frame: null }, { onConflict: 'email' }));
        }

        // ── 업적 ──
        const progressMap: Record<string, any> = {};
        const newlyUnlocked: string[] = [];
        for (const ap of (achProgress || [])) {
          progressMap[ap.achievement_id] = {
            achievementId: ap.achievement_id, progress: ap.progress,
            unlocked: ap.unlocked, unlockedAt: ap.unlocked_at, notified: ap.notified,
          };
          if (ap.unlocked && !ap.notified) newlyUnlocked.push(ap.achievement_id);
        }
        const definitions = (achDefs || []).map((a: any) => ({
          id: a.id, name: a.name, description: a.description, icon: a.icon,
          category: a.category, conditionType: a.condition_type, conditionTarget: a.condition_target,
          rewardXp: a.reward_xp, rewardCredits: a.reward_credits,
          rewardTitle: a.reward_title, rewardBadge: a.reward_badge,
          rewardGachaTickets: a.reward_gacha_tickets || 0,
          isHidden: a.is_hidden, isActive: a.is_active, sortOrder: a.sort_order,
        }));

        // ── 퀘스트 ──
        const questDefMap: Record<string, any> = {};
        for (const qd of (questDefs || [])) questDefMap[qd.id] = qd;
        const quests = (todayQuests || []).map((qst: any) => {
          const def = questDefMap[qst.quest_id];
          return {
            questId: qst.quest_id, name: def?.name || qst.quest_id,
            description: def?.description || '', icon: def?.icon || '📋',
            questType: def?.quest_type || 'generate_content', target: def?.target || 1,
            progress: qst.progress, completed: qst.completed, rewardClaimed: qst.reward_claimed,
            rewardXp: def?.reward_xp || 10, rewardCredits: def?.reward_credits || 5,
          };
        });

        // ── 이벤트 ──
        const activeEvents = (events || []).map((e: any) => ({
          id: e.id, name: e.name, description: e.description, icon: e.icon,
          startAt: e.start_at, endAt: e.end_at,
          xpMultiplier: e.xp_multiplier, dropRateMultiplier: e.drop_rate_multiplier,
          specialGachaItems: e.special_gacha_items || [], isActive: e.is_active,
        }));

        // ── 인벤토리 ──
        // equipped_badges 배열 기반으로 실제 장착 여부 결정 (is_equipped 컬럼과 불일치 방지)
        const equippedBadgeSet = new Set<string>(eqData?.equipped_badges || []);
        const equippedTitleId = eqData?.equipped_title || null;
        const equippedFrameId = eqData?.equipped_frame || null;

        const inventory = { titles: [] as any[], badges: [] as any[], frames: [] as any[], consumables: [] as any[] };
        for (const inv of (invData || [])) {
          const def = gachaDefMap[inv.item_id];
          if (!def) continue;
          // is_equipped를 equipped 테이블 기준으로 보정
          let actualEquipped = inv.is_equipped;
          if (def.item_type === 'badge') actualEquipped = equippedBadgeSet.has(inv.item_id);
          else if (def.item_type === 'title') actualEquipped = inv.item_id === equippedTitleId;
          else if (def.item_type === 'avatar_frame') actualEquipped = inv.item_id === equippedFrameId;
          const item = {
            inventoryId: inv.id, itemId: inv.item_id,
            name: def.name, emoji: def.emoji, itemType: def.item_type,
            rarity: def.rarity, quantity: inv.quantity,
            isEquipped: actualEquipped, isActive: inv.is_active,
            activeUntil: inv.active_until, obtainedVia: inv.obtained_via,
            effectValue: def.effect_value,
          };
          if (def.item_type === 'title') inventory.titles.push(item);
          else if (def.item_type === 'badge') inventory.badges.push(item);
          else if (def.item_type === 'avatar_frame') inventory.frames.push(item);
          else inventory.consumables.push(item);
        }

        return res.json({
          config, user, equipped,
          achievements: { definitions, progress: progressMap, newlyUnlocked },
          quests, activeEvents, inventory,
        });
      }

      // ── 액션 기록 (서버 사이드 XP 계산) ──
      case 'game-recordAction': {
        const { token, actionType, count: actionCount = 1, metadata = {} } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const email = session.email;

        // 설정 로드
        const { data: cfgRows } = await supabase.from('c2gen_game_config').select('key, value');
        const cfg: Record<string, any> = {};
        for (const r of (cfgRows || [])) cfg[r.key] = r.value;

        const xpRates = cfg.xp_rates || { script: 10, image_per: 5, audio_per: 3, video_per: 8, daily_bonus: 5, streak_multiplier: 0.1, combo_multiplier: 0.05, max_combo_multiplier: 2.0 };
        const levelsConfig = cfg.levels || { thresholds: [0,50,120,200,350,500,750,1000,1500,2500] };
        const gachaSettings = cfg.gacha_settings || { pull_interval: 5, pity: { epic_guarantee: 30, legendary_guarantee: 100 } };
        const milestoneSettings = cfg.milestone_settings || { generation_milestones: [] };
        const streakSettings = cfg.streak_settings || { milestones: [], milestone_rewards: [] };

        // 유저 현재 데이터 (컬럼이 없으면 폴백)
        let usr: Record<string, any> | null = null;
        {
          const { data: d1, error: e1 } = await supabase.from('c2gen_users')
            .select('xp, level, total_generations, total_images, total_audio, total_videos, streak_count, streak_last_date, gacha_count, gacha_tickets, gacha_pity_epic, gacha_pity_legendary, total_gacha_pulls, max_combo, prestige_level, prestige_xp_bonus, credits')
            .eq('email', email).single();
          if (d1) {
            usr = d1;
          } else {
            // 컬럼 누락 시 최소 컬럼으로 폴백
            const { data: d2 } = await supabase.from('c2gen_users')
              .select('xp, level, total_generations, streak_count, streak_last_date, gacha_count, credits')
              .eq('email', email).single();
            if (d2) usr = d2;
          }
        }
        if (!usr) return res.status(404).json({ error: 'user not found' });

        const { imageCount = 0, audioCount = 0, videoCount = 0, sessionCombo = 0 } = metadata;

        // 1) 기본 XP 계산
        let baseXp = 0;
        if (actionType === 'generation_complete') {
          baseXp = xpRates.script + (imageCount * xpRates.image_per) + (audioCount * xpRates.audio_per) + (videoCount * xpRates.video_per);
        } else if (actionType === 'image_created') {
          baseXp = actionCount * xpRates.image_per;
        } else if (actionType === 'audio_created') {
          baseXp = actionCount * xpRates.audio_per;
        } else if (actionType === 'video_created') {
          baseXp = actionCount * xpRates.video_per;
        }

        // 2) 스트릭 업데이트 + 배율
        const today = getKSTDateStr();
        let newStreak = usr.streak_count || 0;
        let streakBonus = 0;
        let streakMilestoneReward = null;
        if (usr.streak_last_date !== today) {
          const yesterday = getKSTDateStr(-1);
          if (usr.streak_last_date === yesterday) {
            newStreak = (usr.streak_count || 0) + 1;
          } else if (!usr.streak_last_date) {
            newStreak = 1;
          } else {
            newStreak = 1;
          }
          // 스트릭 마일스톤 체크
          const sm = streakSettings.milestones || [];
          const smr = streakSettings.milestone_rewards || [];
          for (let i = 0; i < sm.length; i++) {
            if (newStreak === sm[i] && smr[i]) {
              streakMilestoneReward = smr[i];
              baseXp += smr[i].xp || 0;
              break;
            }
          }
        }

        const streakMultiplier = 1 + (xpRates.streak_multiplier || 0.1) * Math.min(newStreak, 30);
        const comboMultiplier = 1 + (xpRates.combo_multiplier || 0.05) * Math.min(sessionCombo, xpRates.max_combo_multiplier / (xpRates.combo_multiplier || 0.05));
        const prestigeMultiplier = 1 + (usr.prestige_xp_bonus || 0);

        // 이벤트 배율
        const nowISO = new Date().toISOString();
        const { data: activeEvts } = await supabase.from('c2gen_events').select('xp_multiplier')
          .eq('is_active', true).lte('start_at', nowISO).gte('end_at', nowISO);
        let eventMultiplier = 1;
        for (const e of (activeEvts || [])) eventMultiplier *= (e.xp_multiplier || 1);

        // XP 부스터 체크
        const { data: activeBoosters } = await supabase.from('c2gen_user_inventory')
          .select('id, item_id').eq('email', email).eq('is_active', true)
          .gt('active_until', nowISO);
        let boosterMultiplier = 1;
        if (activeBoosters && activeBoosters.length > 0) {
          const boosterItemIds = activeBoosters.map((b: any) => b.item_id);
          const { data: boosterDefs } = await supabase.from('c2gen_gacha_pool').select('effect_value').in('id', boosterItemIds);
          for (const bd of (boosterDefs || [])) {
            if (bd.effect_value?.xp_multiplier) boosterMultiplier *= bd.effect_value.xp_multiplier;
          }
        }

        const xpGained = Math.round(baseXp * streakMultiplier * comboMultiplier * prestigeMultiplier * eventMultiplier * boosterMultiplier);
        const newXp = (usr.xp || 0) + xpGained;

        // 3) 레벨 계산
        const thresholds = levelsConfig.thresholds || [0];
        const oldLevel = usr.level || 1;
        let newLevel = 1;
        for (let i = thresholds.length - 1; i >= 0; i--) {
          if (newXp >= thresholds[i]) { newLevel = i + 1; break; }
        }
        const leveledUp = newLevel > oldLevel;

        // 레벨업 보상
        let levelReward = null;
        let rewardCredits = 0;
        let rewardTickets = 0;
        if (leveledUp && levelsConfig.rewards && levelsConfig.rewards[newLevel - 1]) {
          levelReward = levelsConfig.rewards[newLevel - 1];
          rewardCredits = levelReward.credits || 0;
          rewardTickets = levelReward.gacha_tickets || 0;
        }

        // 4) 통계 업데이트
        const newTotalGen = (usr.total_generations || 0) + (actionType === 'generation_complete' ? 1 : 0);
        const newTotalImages = (usr.total_images || 0) + imageCount;
        const newTotalAudio = (usr.total_audio || 0) + audioCount;
        const newTotalVideos = (usr.total_videos || 0) + videoCount;
        const newMaxCombo = Math.max(usr.max_combo || 0, sessionCombo);
        const newGachaCount = (usr.gacha_count || 0) + (actionType === 'generation_complete' ? 1 : 0);

        // 5) 마일스톤 체크
        let milestoneReached = null;
        const milestones = milestoneSettings.generation_milestones || [];
        for (const m of milestones) {
          if (newTotalGen === m.count) {
            milestoneReached = m;
            break;
          }
        }

        // 6) 뽑기 자격 체크
        let gachaResult = null;
        let newPityEpic = usr.gacha_pity_epic || 0;
        let newPityLegendary = usr.gacha_pity_legendary || 0;
        let newGachaPulls = usr.total_gacha_pulls || 0;
        let newGachaTickets = (usr.gacha_tickets || 0) + rewardTickets;

        const pullInterval = gachaSettings.pull_interval || 5;
        if (actionType === 'generation_complete' && newGachaCount % pullInterval === 0) {
          // 자동 뽑기
          newPityEpic++;
          newPityLegendary++;
          newGachaPulls++;

          // 등급 결정
          const rarities = gachaSettings.rarities || {};
          let targetRarity = 'common';
          const epicGuarantee = gachaSettings.pity?.epic_guarantee || 30;
          const legendaryGuarantee = gachaSettings.pity?.legendary_guarantee || 100;

          if (newPityLegendary >= legendaryGuarantee) {
            targetRarity = 'legendary';
            newPityLegendary = 0;
            newPityEpic = 0;
          } else if (newPityEpic >= epicGuarantee) {
            targetRarity = 'epic';
            newPityEpic = 0;
          } else {
            const roll = Math.random();
            let cumulative = 0;
            for (const [rarity, info] of Object.entries(rarities)) {
              cumulative += (info as any).rate || 0;
              if (roll < cumulative) { targetRarity = rarity; break; }
            }
          }

          // 해당 등급 아이템 랜덤 선택
          const { data: poolItems } = await supabase.from('c2gen_gacha_pool')
            .select('*').eq('rarity', targetRarity).eq('is_active', true);

          if (poolItems && poolItems.length > 0) {
            const picked = poolItems[Math.floor(Math.random() * poolItems.length)];

            // 인벤토리에 추가/수량 증가 (중복 행 대비 .single() 미사용)
            const { data: existingRows1 } = await supabase.from('c2gen_user_inventory')
              .select('id, quantity').eq('email', email).eq('item_id', picked.id).order('quantity', { ascending: false }).limit(1);
            const existing = existingRows1?.[0] ?? null;

            let isNew = false;
            if (existing) {
              await supabase.from('c2gen_user_inventory')
                .update({ quantity: existing.quantity + 1, obtained_at: new Date().toISOString() })
                .eq('id', existing.id);
            } else {
              isNew = true;
              await supabase.from('c2gen_user_inventory').insert({
                email, item_id: picked.id, quantity: 1,
                obtained_via: 'gacha', obtained_at: new Date().toISOString(),
                is_active: false, is_equipped: false,
              });
            }

            // 소모품 자동 처리 (credit_voucher)
            if (picked.item_type === 'credit_voucher' && picked.effect_value?.credits) {
              rewardCredits += picked.effect_value.credits;
            }

            gachaResult = {
              item: {
                id: picked.id, name: picked.name, description: picked.description,
                itemType: picked.item_type, rarity: picked.rarity, emoji: picked.emoji,
                effectValue: picked.effect_value, isActive: picked.is_active, sortOrder: picked.sort_order,
              },
              isNew,
            };

            if (targetRarity !== 'legendary') newPityLegendary = newPityLegendary;
            if (targetRarity !== 'epic' && targetRarity !== 'legendary') newPityEpic = newPityEpic;
          }
        }

        // 7) DB 업데이트
        const updates: Record<string, any> = {
          xp: newXp,
          level: newLevel,
          total_generations: newTotalGen,
          total_images: newTotalImages,
          total_audio: newTotalAudio,
          total_videos: newTotalVideos,
          streak_count: newStreak,
          streak_last_date: today,
          gacha_count: newGachaCount,
          gacha_tickets: newGachaTickets,
          gacha_pity_epic: newPityEpic,
          gacha_pity_legendary: newPityLegendary,
          total_gacha_pulls: newGachaPulls,
          max_combo: newMaxCombo,
        };

        if (rewardCredits > 0) {
          updates.credits = (usr.credits || 0) + rewardCredits;
        }

        await supabase.from('c2gen_users').update(updates).eq('email', email);

        // 레벨업 보상 트랜잭션 기록
        if (rewardCredits > 0) {
          supabase.from('c2gen_credit_transactions').insert({
            email, amount: rewardCredits, balance_after: (usr.credits || 0) + rewardCredits,
            type: 'bonus', description: `레벨업 보상: Lv.${newLevel}`,
          }).then(() => {});
        }

        // 8) 업적 진행률 업데이트 (배치 처리 — N번 쿼리 → 2번으로 최적화)
        const achievementsUnlocked: any[] = [];
        const [{ data: achDefs }, { data: achProgress }] = await Promise.all([
          supabase.from('c2gen_achievements').select('*').eq('is_active', true),
          supabase.from('c2gen_user_achievements').select('achievement_id, progress, unlocked').eq('email', email),
        ]);

        // 기존 진행률 맵
        const achProgressMap: Record<string, any> = {};
        for (const ap of (achProgress || [])) achProgressMap[ap.achievement_id] = ap;

        const nowISO2 = new Date().toISOString();
        const upsertRows: any[] = [];
        let bonusCredits = 0;
        let bonusTickets = 0;

        for (const ach of (achDefs || [])) {
          let currentValue = 0;
          switch (ach.condition_type) {
            case 'total_generations': currentValue = newTotalGen; break;
            case 'total_images': currentValue = newTotalImages; break;
            case 'total_audio': currentValue = newTotalAudio; break;
            case 'total_videos': currentValue = newTotalVideos; break;
            case 'streak_days': currentValue = newStreak; break;
            case 'level_reached': currentValue = newLevel; break;
            case 'combo_count': currentValue = sessionCombo; break;
            case 'gacha_pulls': currentValue = newGachaPulls; break;
            case 'total_xp': currentValue = newXp; break;
            case 'special_konami': currentValue = (actionType === 'special_konami') ? 1 : 0; break;
            case 'special_logo_click': currentValue = (actionType === 'special_logo_click') ? 1 : 0; break;
            default: continue;
          }

          const prev = achProgressMap[ach.id];
          if (prev?.unlocked) continue;

          const newProgress = Math.min(currentValue, ach.condition_target);
          if (prev && newProgress <= (prev.progress || 0)) continue; // 진행 없으면 스킵

          const justUnlocked = newProgress >= ach.condition_target;
          upsertRows.push({
            email, achievement_id: ach.id,
            progress: newProgress,
            unlocked: justUnlocked,
            unlocked_at: justUnlocked ? nowISO2 : null,
            notified: false,
          });

          if (justUnlocked) {
            achievementsUnlocked.push({
              id: ach.id, name: ach.name, description: ach.description, icon: ach.icon,
              category: ach.category, rewardXp: ach.reward_xp, rewardCredits: ach.reward_credits,
              progress: newProgress,
            });
            bonusCredits += ach.reward_credits || 0;
            bonusTickets += ach.reward_gacha_tickets || 0;
          }
        }

        // 변경된 업적만 한 번에 upsert
        if (upsertRows.length > 0) {
          const { error: upsertErr } = await supabase.from('c2gen_user_achievements')
            .upsert(upsertRows, { onConflict: 'email,achievement_id' });
          if (upsertErr) console.error('[ach] batch upsert error:', upsertErr.message);
        }
        // 보상 지급 (한 번에)
        if (bonusCredits > 0 || bonusTickets > 0) {
          await supabase.from('c2gen_users').update({
            ...(bonusCredits > 0 ? { credits: (usr.credits || 0) + rewardCredits + bonusCredits } : {}),
            ...(bonusTickets > 0 ? { gacha_tickets: newGachaTickets + bonusTickets } : {}),
          }).eq('email', email);

          // 업적 보상 트랜잭션 기록
          if (bonusCredits > 0) {
            const achNames = achievementsUnlocked.map((a: any) => a.name).join(', ');
            supabase.from('c2gen_credit_transactions').insert({
              email, amount: bonusCredits, balance_after: (usr.credits || 0) + rewardCredits + bonusCredits,
              type: 'bonus', description: `업적 보상: ${achNames}`,
            }).then(() => {});
          }
        }

        // 9) 퀘스트 진행률 업데이트
        const questProgress: any[] = [];
        const todayQ = getKSTDateStr();
        console.log(`[Quest Debug] todayQ=${todayQ}, actionType=${actionType}, email=${email}, imageCount=${imageCount}`);
        const { data: userQuests, error: questErr } = await supabase.from('c2gen_user_quests')
          .select('id, quest_id, progress, completed, reward_claimed')
          .eq('email', email).eq('assigned_date', todayQ);
        console.log(`[Quest Debug] userQuests found: ${userQuests?.length ?? 0}, error: ${questErr?.message || 'none'}`);

        if (userQuests && userQuests.length > 0) {
          const qIds = userQuests.map((q: any) => q.quest_id);
          const { data: qDefs } = await supabase.from('c2gen_quest_pool').select('*').in('id', qIds);
          const qDefMap: Record<string, any> = {};
          for (const qd of (qDefs || [])) qDefMap[qd.id] = qd;

          for (const uq of userQuests) {
            if (uq.completed) {
              questProgress.push({
                questId: uq.quest_id, progress: uq.progress,
                target: qDefMap[uq.quest_id]?.target || 1,
                justCompleted: false,
              });
              continue;
            }

            const def = qDefMap[uq.quest_id];
            if (!def) continue;

            let increment = 0;
            const qt = def.quest_type;
            if ((qt === 'generate_content' || qt === 'generate_script') && actionType === 'generation_complete') increment = 1;
            else if (qt === 'generate_images' && actionType === 'generation_complete') increment = imageCount;
            else if (qt === 'generate_audio' && actionType === 'generation_complete') increment = audioCount;
            else if ((qt === 'create_video' || qt === 'generate_video') && actionType === 'generation_complete') increment = videoCount;
            else if (qt === 'combo_reach' && sessionCombo >= def.target) increment = def.target;
            else if (qt === 'login' && actionType === 'daily_login') increment = 1;
            else if (qt === 'gacha_pull' && actionType === 'gacha_pull') increment = 1;
            else if (qt === 'share_project' && actionType === 'share_project') increment = 1;
            console.log(`[Quest Debug] quest=${uq.quest_id}, qt=${qt}, actionType=${actionType}, increment=${increment}, progress=${uq.progress}`);

            if (increment > 0) {
              const newQProgress = Math.min(uq.progress + increment, def.target);
              const justCompleted = newQProgress >= def.target;
              await supabase.from('c2gen_user_quests').update({
                progress: newQProgress,
                completed: justCompleted,
                completed_at: justCompleted ? new Date().toISOString() : null,
              }).eq('id', uq.id);

              questProgress.push({
                questId: uq.quest_id, progress: newQProgress,
                target: def.target, justCompleted,
              });
            } else {
              // 변화 없어도 포함 → 클라이언트 상태가 DB와 항상 일치
              questProgress.push({
                questId: uq.quest_id, progress: uq.progress,
                target: def.target, justCompleted: false,
              });
            }
          }
        }

        const titles = levelsConfig.titles || [];
        const emojis = levelsConfig.emojis || [];
        const colors = levelsConfig.colors || [];

        console.log(`[Quest Debug] FINAL questProgress count=${questProgress.length}, xpGained=${xpGained}, achievementsUnlocked=${achievementsUnlocked.length}`);
        return res.json({
          xpGained,
          totalXp: newXp,
          newLevel: leveledUp ? newLevel : null,
          oldLevel,
          levelTitle: titles[newLevel - 1] || `Lv.${newLevel}`,
          levelEmoji: emojis[newLevel - 1] || '🌱',
          levelColor: colors[newLevel - 1] || '#94a3b8',
          levelReward,
          achievementsUnlocked,
          questProgress,
          milestoneReached,
          streakUpdated: { count: newStreak, bonus: Math.round(baseXp * (streakMultiplier - 1)), milestoneReward: streakMilestoneReward },
          gachaResult,
          comboCount: sessionCombo,
        });
      }

      // ── 퀘스트 보상 수령 ──
      case 'game-claimQuestReward': {
        const { token, questId } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const todayKST = getKSTDateStr();
        const { data: uq } = await supabase.from('c2gen_user_quests')
          .select('id, completed, reward_claimed')
          .eq('email', session.email).eq('quest_id', questId).eq('assigned_date', todayKST).single();

        if (!uq) return res.status(404).json({ error: 'quest not found' });
        if (!uq.completed) return res.status(400).json({ error: 'quest not completed' });
        if (uq.reward_claimed) return res.status(400).json({ error: 'reward already claimed' });

        const { data: qDef } = await supabase.from('c2gen_quest_pool').select('reward_xp, reward_credits').eq('id', questId).single();
        const rewardXp = qDef?.reward_xp || 10;
        const rewardCr = qDef?.reward_credits || 5;

        // 보상 지급
        const { data: usr } = await supabase.from('c2gen_users').select('xp, credits').eq('email', session.email).single();
        await supabase.from('c2gen_users').update({
          xp: (usr?.xp || 0) + rewardXp,
          credits: (usr?.credits || 0) + rewardCr,
        }).eq('email', session.email);

        // 퀘스트 보상 트랜잭션 기록
        if (rewardCr > 0) {
          supabase.from('c2gen_credit_transactions').insert({
            email: session.email, amount: rewardCr, balance_after: (usr?.credits || 0) + rewardCr,
            type: 'bonus', description: `퀘스트 보상`,
          }).then(() => {});
        }

        await supabase.from('c2gen_user_quests').update({ reward_claimed: true }).eq('id', uq.id);

        return res.json({ success: true, rewardXp, rewardCredits: rewardCr });
      }

      // ── 뽑기 (티켓 사용) ──
      case 'game-pullGacha': {
        const { token } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        // 유저 정보 + 가챠 설정 + 전체 가챠 풀을 병렬 로드
        const [{ data: usr }, { data: cfgRow }, { data: allPoolItems }] = await Promise.all([
          supabase.from('c2gen_users')
            .select('gacha_tickets, gacha_pity_epic, gacha_pity_legendary, total_gacha_pulls, credits')
            .eq('email', session.email).single(),
          supabase.from('c2gen_game_config').select('value').eq('key', 'gacha_settings').single(),
          supabase.from('c2gen_gacha_pool').select('*').eq('is_active', true),
        ]);

        if (!usr || (usr.gacha_tickets || 0) < 1) {
          return res.status(400).json({ error: '뽑기 티켓이 부족합니다.' });
        }

        const gs = cfgRow?.value || { rarity_rates: { common: 50, uncommon: 25, rare: 15, epic: 8, legendary: 2 }, pity: { epic_threshold: 30, legendary_threshold: 100 } };

        let pityEpic = (usr.gacha_pity_epic || 0) + 1;
        let pityLegendary = (usr.gacha_pity_legendary || 0) + 1;

        let targetRarity = 'common';
        if (pityLegendary >= (gs.pity?.legendary_threshold || gs.pity?.epic_guarantee || 100)) {
          targetRarity = 'legendary'; pityLegendary = 0; pityEpic = 0;
        } else if (pityEpic >= (gs.pity?.epic_threshold || gs.pity?.epic_guarantee || 30)) {
          targetRarity = 'epic'; pityEpic = 0;
        } else {
          const rates = gs.rarity_rates || gs.rarities || { common: 100 };
          const total = (Object.values(rates) as any[]).reduce((a: number, b: any) => a + (typeof b === 'number' ? b : (b?.rate || 0) * 100), 0);
          const roll = Math.random() * (total as number);
          let cum = 0;
          for (const [r, val] of Object.entries(rates)) {
            const rateNum = typeof val === 'number' ? val : ((val as any)?.rate || 0) * 100;
            cum += rateNum;
            if (roll < cum) { targetRarity = r; break; }
          }
        }

        // 이미 로드된 풀에서 레어리티 필터링
        const poolItems = (allPoolItems || []).filter((i: any) => i.rarity === targetRarity);
        if (poolItems.length === 0) {
          return res.status(500).json({ error: 'No gacha items available' });
        }

        const picked = poolItems[Math.floor(Math.random() * poolItems.length)];

        // 인벤토리 확인 + 유저 업데이트를 병렬 실행
        let bonusCredits = 0;
        if (picked.item_type === 'credit_voucher' && picked.effect_value?.credits) {
          bonusCredits = picked.effect_value.credits;
        }

        const [{ data: existingRows2 }] = await Promise.all([
          supabase.from('c2gen_user_inventory')
            .select('id, quantity').eq('email', session.email).eq('item_id', picked.id).order('quantity', { ascending: false }).limit(1),
          supabase.from('c2gen_users').update({
            gacha_tickets: (usr.gacha_tickets || 0) - 1,
            gacha_pity_epic: pityEpic,
            gacha_pity_legendary: pityLegendary,
            total_gacha_pulls: (usr.total_gacha_pulls || 0) + 1,
            ...(bonusCredits > 0 ? { credits: (usr.credits || 0) + bonusCredits } : {}),
          }).eq('email', session.email),
        ]);

        const existing = existingRows2?.[0] ?? null;
        let isNew = false;
        if (existing) {
          await supabase.from('c2gen_user_inventory')
            .update({ quantity: existing.quantity + 1 }).eq('id', existing.id);
        } else {
          isNew = true;
          await supabase.from('c2gen_user_inventory').insert({
            email: session.email, item_id: picked.id, quantity: 1, obtained_via: 'gacha',
            is_active: false, is_equipped: false,
          });
        }

        return res.json({
          result: {
            item: {
              id: picked.id, name: picked.name, description: picked.description,
              itemType: picked.item_type, rarity: picked.rarity, emoji: picked.emoji,
              effectValue: picked.effect_value, isActive: true, sortOrder: picked.sort_order,
            },
            isNew,
          },
        });
      }

      // ── 아이템 장착 ──
      case 'game-equipItem': {
        const { token, slot, inventoryItemId } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const eEmail = session.email;

        // 인벤토리 조회 + 현재 장착 정보를 병렬 로드
        const [invResult, eqResult] = await Promise.all([
          inventoryItemId
            ? supabase.from('c2gen_user_inventory').select('id, item_id').eq('email', eEmail).eq('id', inventoryItemId).single()
            : Promise.resolve({ data: null }),
          supabase.from('c2gen_user_equipped').select('equipped_title, equipped_frame, equipped_badges').eq('email', eEmail).single(),
        ]);

        const gachaItemId = invResult.data?.item_id || null;
        if (inventoryItemId && !gachaItemId) return res.status(404).json({ error: '인벤토리에 해당 아이템이 없습니다.' });

        const prev = eqResult.data;
        const now = new Date().toISOString();
        const writes: Promise<any>[] = [];
        const q = (query: PromiseLike<any>) => Promise.resolve(query);

        if (slot === 'title') {
          if (prev?.equipped_title && prev.equipped_title !== gachaItemId) {
            writes.push(q(supabase.from('c2gen_user_inventory').update({ is_equipped: false }).eq('email', eEmail).eq('item_id', prev.equipped_title)));
          }
          writes.push(q(supabase.from('c2gen_user_equipped').upsert({ email: eEmail, equipped_title: gachaItemId, updated_at: now }, { onConflict: 'email' })));
          if (gachaItemId) {
            writes.push(q(supabase.from('c2gen_user_inventory').update({ is_equipped: true }).eq('email', eEmail).eq('item_id', gachaItemId)));
          }
        } else if (slot === 'frame') {
          if (prev?.equipped_frame && prev.equipped_frame !== gachaItemId) {
            writes.push(q(supabase.from('c2gen_user_inventory').update({ is_equipped: false }).eq('email', eEmail).eq('item_id', prev.equipped_frame)));
          }
          writes.push(q(supabase.from('c2gen_user_equipped').upsert({ email: eEmail, equipped_frame: gachaItemId, updated_at: now }, { onConflict: 'email' })));
          if (gachaItemId) {
            writes.push(q(supabase.from('c2gen_user_inventory').update({ is_equipped: true }).eq('email', eEmail).eq('item_id', gachaItemId)));
          }
        } else if (slot === 'badge') {
          let badges: string[] = prev?.equipped_badges || [];
          if (gachaItemId) {
            if (badges.includes(gachaItemId)) {
              // 이미 장착된 뱃지 → 해제 (토글)
              badges = badges.filter(b => b !== gachaItemId);
              writes.push(q(supabase.from('c2gen_user_inventory').update({ is_equipped: false }).eq('email', eEmail).eq('item_id', gachaItemId)));
            } else if (badges.length < 3) {
              // 새 뱃지 장착
              badges = [...badges, gachaItemId];
              writes.push(q(supabase.from('c2gen_user_inventory').update({ is_equipped: true }).eq('email', eEmail).eq('item_id', gachaItemId)));
            }
          }
          writes.push(q(supabase.from('c2gen_user_equipped').upsert({ email: eEmail, equipped_badges: badges, updated_at: now }, { onConflict: 'email' })));
        }

        await Promise.all(writes);
        return res.json({ success: true });
      }

      // ── 소모품 사용 ──
      case 'game-useConsumable': {
        const { token, inventoryItemId } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        // email로 전체 인벤토리 조회 후 메모리에서 매칭 (UUID id 또는 item_id 둘 다 시도)
        const { data: allUserInv } = await supabase.from('c2gen_user_inventory')
          .select('id, item_id, quantity, is_active').eq('email', session.email);
        const inv = (allUserInv || []).find((r: any) => r.id === inventoryItemId || r.item_id === inventoryItemId) ?? null;

        if (!inv || inv.quantity < 1) {
          const dbStr = (allUserInv || []).map((r: any) => `id:${r.id} item_id:${r.item_id} qty:${r.quantity}`).join(' || ');
          console.error('[useConsumable] NOT FOUND sentId:', inventoryItemId, 'email:', session.email, 'db:', dbStr);
          return res.status(400).json({ error: '아이템이 없습니다.', _debug: `sent="${inventoryItemId}" || db=[${dbStr}]` });
        }

        const { data: itemDef } = await supabase.from('c2gen_gacha_pool').select('*').eq('id', inv.item_id).single();
        if (!itemDef) return res.status(404).json({ error: 'item def not found' });

        if (itemDef.item_type === 'xp_booster') {
          const hours = itemDef.effect_value?.duration_hours || 2;
          const until = new Date(Date.now() + hours * 3600000).toISOString();
          await supabase.from('c2gen_user_inventory').update({
            quantity: inv.quantity - 1, is_active: true, active_until: until,
          }).eq('id', inv.id);
          return res.json({ success: true, effect: { type: 'xp_booster', multiplier: itemDef.effect_value?.xp_multiplier, until } });
        }

        if (itemDef.item_type === 'credit_voucher') {
          const credits = itemDef.effect_value?.credits || 0;
          const { data: usr } = await supabase.from('c2gen_users').select('credits').eq('email', session.email).single();
          await supabase.from('c2gen_users').update({ credits: (usr?.credits || 0) + credits }).eq('email', session.email);
          await supabase.from('c2gen_user_inventory').update({ quantity: inv.quantity - 1 }).eq('id', inv.id);
          return res.json({ success: true, effect: { type: 'credit_voucher', credits } });
        }

        return res.status(400).json({ error: '사용할 수 없는 아이템입니다.' });
      }

      // ── 프레스티지 ──
      case 'game-prestige': {
        const { token } = params;
        if (!token) return res.status(400).json({ error: 'token required' });

        const { data: session } = await supabase
          .from('c2gen_sessions').select('email')
          .eq('token', token).gt('expires_at', new Date().toISOString()).single();
        if (!session) return res.status(401).json({ error: 'invalid session' });

        const { data: cfgRow } = await supabase.from('c2gen_game_config').select('value').eq('key', 'prestige_settings').single();
        const ps = cfgRow?.value || { enabled: false, xp_multiplier_per_prestige: 0.1, max_prestige: 10 };

        if (!ps.enabled) return res.status(400).json({ error: '프레스티지 시스템이 비활성화 상태입니다.' });

        const { data: cfgLvl } = await supabase.from('c2gen_game_config').select('value').eq('key', 'levels').single();
        const maxLevel = (cfgLvl?.value?.thresholds?.length) || 10;

        const { data: usr } = await supabase.from('c2gen_users')
          .select('level, prestige_level, prestige_xp_bonus')
          .eq('email', session.email).single();

        if (!usr || usr.level < maxLevel) {
          return res.status(400).json({ error: `최대 레벨(Lv.${maxLevel})에 도달해야 프레스티지할 수 있습니다.` });
        }
        if ((usr.prestige_level || 0) >= ps.max_prestige) {
          return res.status(400).json({ error: '최대 프레스티지에 도달했습니다.' });
        }

        const newPrestige = (usr.prestige_level || 0) + 1;
        const newBonus = newPrestige * (ps.xp_multiplier_per_prestige || 0.1);

        await supabase.from('c2gen_users').update({
          xp: 0, level: 1, prestige_level: newPrestige, prestige_xp_bonus: newBonus,
        }).eq('email', session.email);

        return res.json({ success: true, newPrestigeLevel: newPrestige, xpBonus: newBonus });
      }

      // ══════════════════════════════════════════
      // 관리자 게이미피케이션 API
      // ══════════════════════════════════════════

      case 'game-admin-listAchievements': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { data } = await supabase.from('c2gen_achievements').select('*').order('sort_order');
        const achievements = (data || []).map((a: any) => ({ ...a, active: a.is_active ?? a.active ?? false, hidden: a.is_hidden ?? a.hidden ?? false }));
        return res.json({ achievements });
      }

      case 'game-admin-upsertAchievement': {
        const { adminToken, achievement } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const dbAch: Record<string, any> = { ...achievement };
        if ('active' in dbAch) { dbAch.is_active = dbAch.active; delete dbAch.active; }
        if ('hidden' in dbAch) { dbAch.is_hidden = dbAch.hidden; delete dbAch.hidden; }
        const { error } = await supabase.from('c2gen_achievements').upsert(dbAch, { onConflict: 'id' });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }

      case 'game-admin-deleteAchievement': {
        const { adminToken, achievementId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        await supabase.from('c2gen_user_achievements').delete().eq('achievement_id', achievementId);
        await supabase.from('c2gen_achievements').delete().eq('id', achievementId);
        return res.json({ success: true });
      }

      case 'game-admin-listQuests': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { data } = await supabase.from('c2gen_quest_pool').select('*').order('created_at');
        // DB is_active → 프론트 active 매핑
        const quests = (data || []).map((q: any) => ({ ...q, active: q.is_active ?? q.active ?? false }));
        return res.json({ quests });
      }

      case 'game-admin-upsertQuest': {
        const { adminToken, quest } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        // 프론트 active → DB is_active 매핑
        const dbQuest: Record<string, any> = { ...quest };
        if ('active' in dbQuest) {
          dbQuest.is_active = dbQuest.active;
          delete dbQuest.active;
        }
        const { error } = await supabase.from('c2gen_quest_pool').upsert(dbQuest, { onConflict: 'id' });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }

      case 'game-admin-deleteQuest': {
        const { adminToken, questId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        await supabase.from('c2gen_user_quests').delete().eq('quest_id', questId);
        await supabase.from('c2gen_quest_pool').delete().eq('id', questId);
        return res.json({ success: true });
      }

      case 'game-admin-listGachaPool': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { data } = await supabase.from('c2gen_gacha_pool').select('*').order('sort_order');
        return res.json({ items: data || [] });
      }

      case 'game-admin-upsertGachaItem': {
        const { adminToken, item } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { error } = await supabase.from('c2gen_gacha_pool').upsert(item, { onConflict: 'id' });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }

      case 'game-admin-deleteGachaItem': {
        const { adminToken, itemId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        await supabase.from('c2gen_gacha_pool').delete().eq('id', itemId);
        return res.json({ success: true });
      }

      case 'game-admin-grantXp': {
        const { adminToken, email, amount } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { data: usr } = await supabase.from('c2gen_users').select('xp').eq('email', email).single();
        if (!usr) return res.status(404).json({ error: 'user not found' });
        const newXp = Math.max(0, (usr.xp || 0) + (amount || 0));

        // 레벨 재계산
        const { data: cfgRow } = await supabase.from('c2gen_game_config').select('value').eq('key', 'levels').single();
        const thresholds = cfgRow?.value?.thresholds || [0,50,120,200,350,500,750,1000,1500,2500];
        let lv = 1;
        for (let i = thresholds.length - 1; i >= 0; i--) { if (newXp >= thresholds[i]) { lv = i + 1; break; } }

        await supabase.from('c2gen_users').update({ xp: newXp, level: lv }).eq('email', email);
        return res.json({ success: true, newXp, newLevel: lv });
      }

      case 'game-admin-grantTickets': {
        const { adminToken, email, amount } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { data: tUser } = await supabase.from('c2gen_users').select('gacha_tickets').eq('email', email).single();
        if (!tUser) return res.status(404).json({ error: 'user not found' });
        const newTickets = Math.max(0, (tUser.gacha_tickets || 0) + (amount || 0));
        await supabase.from('c2gen_users').update({ gacha_tickets: newTickets }).eq('email', email);
        return res.json({ success: true, message: `뽑기티켓 ${amount}장 지급 완료 (총 ${newTickets}장)`, newTickets });
      }

      case 'game-admin-grantItem': {
        const { adminToken, email, itemId, quantity = 1 } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        const { data: existingRows3 } = await supabase.from('c2gen_user_inventory')
          .select('id, quantity').eq('email', email).eq('item_id', itemId).order('quantity', { ascending: false }).limit(1);
        const existing = existingRows3?.[0] ?? null;

        if (existing) {
          await supabase.from('c2gen_user_inventory').update({ quantity: existing.quantity + quantity }).eq('id', existing.id);
        } else {
          await supabase.from('c2gen_user_inventory').insert({
            email, item_id: itemId, quantity, obtained_via: 'admin',
          });
        }
        return res.json({ success: true });
      }

      case 'game-admin-grantAchievement': {
        const { adminToken, email, achievementId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        const { data: ach } = await supabase.from('c2gen_achievements').select('condition_target').eq('id', achievementId).single();
        await supabase.from('c2gen_user_achievements').upsert({
          email, achievement_id: achievementId,
          progress: ach?.condition_target || 1,
          unlocked: true, unlocked_at: new Date().toISOString(), notified: false,
        }, { onConflict: 'email,achievement_id' });
        return res.json({ success: true });
      }

      case 'game-admin-userGameData': {
        const { adminToken, email } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        const { data: usr } = await supabase.from('c2gen_users')
          .select('xp, level, prestige_level, total_generations, total_images, total_audio, total_videos, streak_count, max_combo, gacha_tickets, total_gacha_pulls, login_days')
          .eq('email', email).single();

        // 장착 정보 (칭호/이모지)
        let equippedTitle = '';
        let equippedTitleEmoji = '';
        try {
          const { data: eq } = await supabase.from('c2gen_user_equipped').select('equipped_title, equipped_title_emoji').eq('email', email).single();
          if (eq) {
            equippedTitle = eq.equipped_title || '';
            equippedTitleEmoji = eq.equipped_title_emoji || '';
          }
        } catch {}

        // profile 매핑 (프론트엔드 기대 형식)
        const profile = usr ? {
          xp: usr.xp || 0,
          level: usr.level || 0,
          prestige: usr.prestige_level || 0,
          total_generations: usr.total_generations || 0,
          total_images: usr.total_images || 0,
          total_audio: usr.total_audio || 0,
          total_videos: usr.total_videos || 0,
          streak_count: usr.streak_count || 0,
          max_combo: usr.max_combo || 0,
          gacha_tickets: usr.gacha_tickets || 0,
          total_pulls: usr.total_gacha_pulls || 0,
          login_days: usr.login_days || 0,
          last_login_date: null,
          title: equippedTitle,
          title_emoji: equippedTitleEmoji,
        } : null;

        // 유저 업적 + 업적 정의 조인
        const { data: achDefs } = await supabase.from('c2gen_achievements').select('id, name, icon, condition_type, condition_target').order('sort_order');
        const { data: userAchs } = await supabase.from('c2gen_user_achievements').select('achievement_id, progress, unlocked, unlocked_at').eq('email', email);
        const userAchMap: Record<string, any> = {};
        (userAchs || []).forEach((ua: any) => { userAchMap[ua.achievement_id] = ua; });
        const achievements = (achDefs || []).map((a: any) => {
          const ua = userAchMap[a.id];
          return {
            id: a.id, name: a.name, icon: a.icon,
            unlocked: ua?.unlocked || false,
            progress: ua?.progress || 0,
            target: a.condition_target || 1,
            unlocked_at: ua?.unlocked_at || null,
          };
        });

        // 유저 인벤토리 + 아이템 정의 조인
        const { data: invRaw } = await supabase.from('c2gen_user_inventory').select('item_id, quantity, obtained_at').eq('email', email);
        const { data: gachaItems } = await supabase.from('c2gen_gacha_pool').select('id, name, emoji, rarity, item_type').order('sort_order');
        const itemMap: Record<string, any> = {};
        (gachaItems || []).forEach((g: any) => { itemMap[g.id] = g; });
        const inventory = (invRaw || []).map((inv: any) => {
          const item = itemMap[inv.item_id];
          return {
            id: inv.item_id,
            name: item?.name || inv.item_id,
            emoji: item?.emoji || '❓',
            rarity: item?.rarity || 'common',
            count: inv.quantity || 1,
            effect_type: item?.item_type || '',
            obtained_at: inv.obtained_at || '',
          };
        });

        // 뽑기 아이템 풀 (관리자 아이템 지급용)
        const gachaPool = (gachaItems || []).map((g: any) => ({
          id: g.id, name: g.name, emoji: g.emoji, rarity: g.rarity,
        }));

        // 업적 옵션 (관리자 업적 부여용)
        const achievementOptions = (achDefs || []).map((a: any) => ({
          id: a.id, name: a.name, icon: a.icon,
        }));

        return res.json({ profile, achievements, inventory, gachaPool, achievementOptions });
      }

      case 'game-admin-bulkAction': {
        const { adminToken, bulkAction, targets, actionParams } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        let emails: string[] = targets || [];
        if (actionParams?.targetAll) {
          const { data: all } = await supabase.from('c2gen_users').select('email').eq('status', 'approved');
          emails = (all || []).map((u: any) => u.email);
        }

        let affected = 0;
        for (const em of emails) {
          if (bulkAction === 'grantXp' && actionParams?.amount) {
            const { data: u } = await supabase.from('c2gen_users').select('xp').eq('email', em).single();
            if (u) {
              await supabase.from('c2gen_users').update({ xp: (u.xp || 0) + actionParams.amount }).eq('email', em);
              affected++;
            }
          } else if (bulkAction === 'grantItem' && actionParams?.itemId) {
            await supabase.from('c2gen_user_inventory').insert({
              email: em, item_id: actionParams.itemId, quantity: actionParams.quantity || 1, obtained_via: 'admin',
            });
            affected++;
          } else if (bulkAction === 'grantTickets' && actionParams?.amount) {
            const { data: u } = await supabase.from('c2gen_users').select('gacha_tickets').eq('email', em).single();
            if (u) {
              await supabase.from('c2gen_users').update({ gacha_tickets: (u.gacha_tickets || 0) + actionParams.amount }).eq('email', em);
              affected++;
            }
          }
        }
        return res.json({ success: true, affected });
      }

      case 'game-admin-listEvents': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { data } = await supabase.from('c2gen_events').select('*').order('start_at', { ascending: false });
        return res.json({ events: data || [] });
      }

      case 'game-admin-upsertEvent': {
        const { adminToken, event } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        const { error } = await supabase.from('c2gen_events').upsert(event, { onConflict: 'id' });
        if (error) return res.status(500).json({ error: error.message });
        return res.json({ success: true });
      }

      case 'game-admin-deleteEvent': {
        const { adminToken, eventId } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });
        await supabase.from('c2gen_events').delete().eq('id', eventId);
        return res.json({ success: true });
      }

      case 'game-admin-leaderboard': {
        const { adminToken, period = 'weekly', category = 'xp_earned' } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        // 실시간 계산
        let orderCol = 'xp';
        if (category === 'generations') orderCol = 'total_generations';
        else if (category === 'streak') orderCol = 'streak_count';
        else if (category === 'level') orderCol = 'level';

        const { data: top } = await supabase.from('c2gen_users')
          .select('email, name, xp, level, total_generations, streak_count')
          .eq('status', 'approved')
          .order(orderCol, { ascending: false })
          .limit(20);

        const rankings = (top || []).map((u: any, i: number) => ({
          rank: i + 1, email: u.email, name: u.name,
          value: u[orderCol] || 0,
        }));

        return res.json({ rankings, period, category });
      }

      case 'gamificationAnalytics': {
        const { adminToken } = params;
        if (!(await validateAdminSession(supabase, adminToken))) return res.status(401).json({ error: '관리자 인증이 필요합니다.' });

        // 1. 레벨 분포
        const { data: allUsers } = await supabase.from('c2gen_users').select('level').eq('status', 'approved');
        const levelMap: Record<number, number> = {};
        (allUsers || []).forEach((u: any) => { const l = u.level || 0; levelMap[l] = (levelMap[l] || 0) + 1; });
        const levelDist = Object.entries(levelMap).map(([lv, cnt]) => ({ level: Number(lv), count: cnt })).sort((a, b) => a.level - b.level);

        // 2. 업적 달성률
        const approvedUserCount = allUsers?.length || 1;
        const { data: achDefs } = await supabase.from('c2gen_achievements').select('id, name, icon').order('sort_order');
        const { data: achUnlocked } = await supabase.from('c2gen_user_achievements').select('achievement_id').eq('unlocked', true);
        const achCountMap: Record<string, number> = {};
        (achUnlocked || []).forEach((a: any) => { achCountMap[a.achievement_id] = (achCountMap[a.achievement_id] || 0) + 1; });
        const achievementRates = (achDefs || []).map((a: any) => ({
          id: a.id, name: a.name, icon: a.icon,
          unlocked: achCountMap[a.id] || 0,
          total: approvedUserCount,
        }));

        // 3. 뽑기 레어도 분포
        const { data: invItems } = await supabase.from('c2gen_user_inventory').select('item_id, quantity');
        const { data: gachaPool } = await supabase.from('c2gen_gacha_pool').select('id, rarity');
        const poolRarity: Record<string, string> = {};
        (gachaPool || []).forEach((g: any) => { poolRarity[g.id] = g.rarity; });
        const rarityMap: Record<string, number> = {};
        (invItems || []).forEach((inv: any) => {
          const r = poolRarity[inv.item_id] || 'common';
          rarityMap[r] = (rarityMap[r] || 0) + (inv.quantity || 1);
        });
        const rarityOrder = ['common', 'uncommon', 'rare', 'epic', 'legendary'];
        const gachaRarityDist = rarityOrder.map(r => ({ rarity: r, count: rarityMap[r] || 0 }));

        // 4. 퀘스트 완료율
        const { data: questDefs } = await supabase.from('c2gen_quest_pool').select('id, name, icon');
        const { data: uqAll } = await supabase.from('c2gen_user_quests').select('quest_id, completed');
        const qAssigned: Record<string, number> = {};
        const qCompleted: Record<string, number> = {};
        (uqAll || []).forEach((q: any) => {
          qAssigned[q.quest_id] = (qAssigned[q.quest_id] || 0) + 1;
          if (q.completed) qCompleted[q.quest_id] = (qCompleted[q.quest_id] || 0) + 1;
        });
        const questRates = (questDefs || []).map((q: any) => ({
          id: q.id, name: q.name, icon: q.icon,
          completed: qCompleted[q.id] || 0,
          assigned: qAssigned[q.id] || 0,
        }));

        return res.json({ success: true, levelDist, achievementRates, gachaRarityDist, questRates });
      }

      default:
        return res.status(400).json({ error: `Unknown gamification action: ${action}` });
    }
  } catch (error: any) {
    console.error(`[api/gamification] ${action} error:`, error.message);
    return res.status(500).json({ error: error.message || 'Internal server error' });
  }
}
