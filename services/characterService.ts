import type { CharacterProfile } from '../types';

const API_URL = '/api/character';

function getToken(): string {
  return localStorage.getItem('c2gen_session_token') || '';
}

async function apiCall(action: string, params: Record<string, unknown> = {}) {
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, token: getToken(), ...params }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(err.error || 'Request failed');
  }
  return res.json();
}

export async function listCharacters(presetId: string): Promise<CharacterProfile[]> {
  const data = await apiCall('character-list', { brand_preset_id: presetId });
  return data.characters;
}

export async function createCharacter(characterData: Partial<CharacterProfile> & { brand_preset_id: string }): Promise<CharacterProfile> {
  const data = await apiCall('character-create', characterData);
  return data.character;
}

export async function updateCharacter(id: string, characterData: Partial<CharacterProfile>): Promise<CharacterProfile> {
  const data = await apiCall('character-update', { id, ...characterData });
  return data.character;
}

export async function deleteCharacter(id: string): Promise<void> {
  await apiCall('character-delete', { id });
}

export async function generateReferenceSheet(characterId: string, presetId: string): Promise<{ multi_angle: Record<string, string> }> {
  return apiCall('character-generate-sheet', { character_id: characterId, brand_preset_id: presetId });
}
