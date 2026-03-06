import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.c2gen.tubegen',
  appName: 'TubeGen AI',
  webDir: 'dist',
  server: {
    url: 'https://tubegen-ai-bice.vercel.app',
    cleartext: false
  }
};

export default config;
