/**
 * MP4 FastStart — moov atom을 파일 앞으로 이동시켜 프로그레시브 재생 지원
 *
 * 브라우저 MediaRecorder는 moov atom을 파일 끝에 배치하여
 * 전체 다운로드 없이는 재생 시작이 불가능함.
 * mp4box.js로 리먹싱하여 moov를 앞으로 이동 → HTTP Range Request로 즉시 재생.
 */
import { createFile, MP4BoxBuffer } from 'mp4box';

export async function fastStartMP4(blob: Blob): Promise<Blob> {
  const arrayBuffer = await blob.arrayBuffer();
  const mp4Buffer = MP4BoxBuffer.fromArrayBuffer(arrayBuffer, 0);

  return new Promise((resolve, reject) => {
    const mp4boxFile = createFile();

    mp4boxFile.onReady = () => {
      try {
        // save()는 moov를 앞에 배치한 새 Blob을 반환
        const result = mp4boxFile.save('output');
        resolve(new Blob([result], { type: 'video/mp4' }));
      } catch (e) {
        reject(e);
      }
    };

    mp4boxFile.onError = (_module: string, message: string) => {
      reject(new Error(message));
    };

    mp4boxFile.appendBuffer(mp4Buffer, true);
    mp4boxFile.flush();
  });
}
