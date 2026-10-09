import type { CapacitorConfig } from '@capacitor/cli'

// Wraps the web app (dist/) into the native Android and iOS apps.
// After changing the web code:  npm run build && npx cap sync
const config: CapacitorConfig = {
  appId: 'com.feldele.feldele',
  appName: 'Feldele',
  webDir: 'dist',
  backgroundColor: '#1f3d2f',
  ios: {
    contentInset: 'never',
  },
}

export default config
