import { useCallback, MutableRefObject } from 'react';
import { GeneratedAsset } from '../types';

interface UseSceneEditorParams {
  assetsRef: MutableRefObject<GeneratedAsset[]>;
  setGeneratedData: (data: GeneratedAsset[]) => void;
  setEditingIndex: (idx: number | null) => void;
  pushUndoState: (snapshot: GeneratedAsset[]) => void;
  snapshotAssets: () => GeneratedAsset[];
  updateAssetAt: (index: number, updates: Partial<GeneratedAsset>) => void;
}

export function useSceneEditor({
  assetsRef, setGeneratedData, setEditingIndex,
  pushUndoState, snapshotAssets, updateAssetAt
}: UseSceneEditorParams) {

  const handleReorderScenes = useCallback((fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    pushUndoState(snapshotAssets());
    const newAssets = [...assetsRef.current];
    const [moved] = newAssets.splice(fromIdx, 1);
    newAssets.splice(toIdx, 0, moved);
    newAssets.forEach((asset, i) => { asset.sceneNumber = i + 1; });
    assetsRef.current = newAssets;
    setGeneratedData([...newAssets]);
  }, [pushUndoState]);

  const handleDeleteScene = useCallback((idx: number) => {
    pushUndoState(snapshotAssets());
    const newAssets = assetsRef.current.filter((_, i) => i !== idx);
    newAssets.forEach((asset, i) => { asset.sceneNumber = i + 1; });
    assetsRef.current = newAssets;
    setGeneratedData([...newAssets]);
    setEditingIndex(null);
  }, [pushUndoState]);

  const handleAddScene = useCallback((afterIdx?: number) => {
    pushUndoState(snapshotAssets());
    const insertAt = afterIdx !== undefined ? afterIdx + 1 : assetsRef.current.length;
    const newAsset: GeneratedAsset = {
      sceneNumber: insertAt + 1,
      narration: '',
      visualPrompt: '',
      imageData: null,
      audioData: null,
      audioDuration: null,
      subtitleData: null,
      videoData: null,
      videoDuration: null,
      status: 'pending',
      customDuration: 5,
    };
    const newAssets = [...assetsRef.current];
    newAssets.splice(insertAt, 0, newAsset);
    newAssets.forEach((asset, i) => { asset.sceneNumber = i + 1; });
    assetsRef.current = newAssets;
    setGeneratedData([...newAssets]);
    setEditingIndex(insertAt);
  }, [pushUndoState]);

  const handleUploadSceneImage = useCallback((idx: number, base64: string) => {
    updateAssetAt(idx, { imageData: base64, videoData: null, status: 'completed' });
  }, []);

  const handleSetCustomDuration = useCallback((idx: number, duration: number) => {
    pushUndoState(snapshotAssets());
    updateAssetAt(idx, { customDuration: duration });
  }, [pushUndoState]);

  const handleSetZoomEffect = useCallback((idx: number, effect: string) => {
    pushUndoState(snapshotAssets());
    updateAssetAt(idx, { zoomEffect: effect as GeneratedAsset['zoomEffect'] });
  }, [pushUndoState]);

  const handleDuplicateScene = useCallback((idx: number) => {
    pushUndoState(snapshotAssets());
    const original = assetsRef.current[idx];
    const insertAt = idx + 1;
    const newAsset: GeneratedAsset = { ...original, sceneNumber: insertAt + 1 };
    const newAssets = [...assetsRef.current];
    newAssets.splice(insertAt, 0, newAsset);
    newAssets.forEach((asset, i) => { asset.sceneNumber = i + 1; });
    assetsRef.current = newAssets;
    setGeneratedData([...newAssets]);
  }, [pushUndoState]);

  const handleAutoZoom = useCallback((pattern: string) => {
    pushUndoState(snapshotAssets());
    const len = assetsRef.current.length;
    const dynamicCycle: GeneratedAsset['zoomEffect'][] = ['zoomIn', 'panLeft', 'zoomOut', 'panRight'];

    for (let i = 0; i < len; i++) {
      let effect: GeneratedAsset['zoomEffect'];
      switch (pattern) {
        case 'alternating':
          effect = i % 2 === 0 ? 'zoomIn' : 'zoomOut';
          break;
        case 'dynamic':
          effect = dynamicCycle[i % 4];
          break;
        case 'sentiment': {
          const asset = assetsRef.current[i];
          const sentiment = asset.analysis?.sentiment;
          const motionType = asset.analysis?.motion_type;
          if (sentiment === 'POSITIVE') {
            effect = 'zoomIn';
          } else if (sentiment === 'NEGATIVE') {
            if (motionType === '동적') {
              effect = i % 2 === 0 ? 'panLeft' : 'panRight';
            } else {
              effect = 'none';
            }
          } else {
            if (motionType === '동적') {
              effect = i % 2 === 0 ? 'panLeft' : 'panRight';
            } else {
              effect = 'zoomIn';
            }
          }
          break;
        }
        case 'static':
          effect = 'none';
          break;
        default:
          return;
      }
      assetsRef.current[i] = { ...assetsRef.current[i], zoomEffect: effect };
    }
    setGeneratedData([...assetsRef.current]);
  }, [pushUndoState]);

  const handleSetTransition = useCallback((idx: number, transition: string) => {
    pushUndoState(snapshotAssets());
    updateAssetAt(idx, { transition: transition as GeneratedAsset['transition'] });
  }, [pushUndoState]);

  const handleSetDefaultTransition = useCallback((transition: string) => {
    pushUndoState(snapshotAssets());
    assetsRef.current = assetsRef.current.map(a => ({
      ...a,
      transition: transition as GeneratedAsset['transition']
    }));
    setGeneratedData([...assetsRef.current]);
  }, [pushUndoState]);

  return {
    handleReorderScenes,
    handleDeleteScene,
    handleAddScene,
    handleUploadSceneImage,
    handleSetCustomDuration,
    handleSetZoomEffect,
    handleDuplicateScene,
    handleAutoZoom,
    handleSetTransition,
    handleSetDefaultTransition,
  };
}
